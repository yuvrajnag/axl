// ============================================================================
// packages/compiler/validator.ts — Semantic validation across all ASTs
// ============================================================================
// The validator operates on the combined ProjectAST. It checks for:
//   - Duplicate entities, actions, workflows, fields
//   - Unknown entity references in types
//   - Unknown action references in workflows, permissions, confirmations
//   - Missing outputs and endpoints on actions
//   - Missing permissions for defined actions
//   - Orphan permissions/confirmations for undefined actions
//   - Invalid types (not primitive and not a known entity)
//   - Circular entity references
//
// Produces human-friendly diagnostics with "Did you mean?" suggestions.
// ============================================================================

import type {
  Diagnostic,
  TypeRef,
  SourceLocation,
} from "./types.js";
import {
  DiagnosticSeverity,
  PRIMITIVE_TYPES,
  GENERIC_TYPES,
  RESERVED_GENERATORS,
} from "./types.js";
import type {
  ProjectAST,
  EntityNode,
  ActionNode,
  WorkflowNode,
  PermissionNode,
  ConfirmationNode,
  RateLimitNode,
  AppNode,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export class Validator {
  private readonly ast: ProjectAST;
  private readonly diagnostics: Diagnostic[] = [];

  /** Set of known entity names for reference checking. */
  private readonly entityNames = new Set<string>();
  /** Set of known action names for reference checking. */
  private readonly actionNames = new Set<string>();
  /** Set of known workflow names. */
  private readonly workflowNames = new Set<string>();

  constructor(ast: ProjectAST) {
    this.ast = ast;
  }

  validate(): Diagnostic[] {
    // Build the name registries first
    this.collectNames();

    // Run all validation passes
    this.validateApp(this.ast.app);
    this.checkDuplicateEntities();
    this.checkDuplicateActions();
    this.checkDuplicateWorkflows();
    this.checkDuplicateFields();
    this.checkEntityTypeReferences();
    this.checkActionOutputTypes();
    this.checkActionInputTypes();
    this.checkMissingOutputs();
    this.checkMissingEndpoints();
    this.checkWorkflowActionReferences();
    this.checkPermissionActionReferences();
    this.checkConfirmationActionReferences();
    this.checkRateLimitActionReferences();
    this.checkMissingPermissions();
    this.checkCircularEntityReferences();

    return this.diagnostics;
  }

  // -------------------------------------------------------------------------
  // Name collection
  // -------------------------------------------------------------------------

  private collectNames(): void {
    for (const entity of this.ast.entities) {
      this.entityNames.add(entity.name);
    }
    for (const action of this.ast.actions) {
      this.actionNames.add(action.name);
    }
    for (const workflow of this.ast.workflows) {
      this.workflowNames.add(workflow.name);
    }
  }

  // -------------------------------------------------------------------------
  // Duplicate checks
  // -------------------------------------------------------------------------

  private validateApp(app: AppNode): void {
    const seen = new Set<string>();
    for (const gen of app.generators) {
      if (!RESERVED_GENERATORS.has(gen)) {
        this.error(
          app.location,
          "AXL340",
          `Unknown generator '${gen}'. Allowed generators: ${[...RESERVED_GENERATORS].join(", ")}`
        );
      } else if (seen.has(gen)) {
        this.error(app.location, "AXL341", `Duplicate generator '${gen}'`);
      }
      seen.add(gen);
    }
  }

  private checkDuplicateEntities(): void {
    const seen = new Map<string, EntityNode>();
    for (const entity of this.ast.entities) {
      const existing = seen.get(entity.name);
      if (existing) {
        this.error(
          entity.location,
          "AXL300",
          `Duplicate entity "${entity.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(entity.name, entity);
      }
    }
  }

  private checkDuplicateActions(): void {
    const seen = new Map<string, ActionNode>();
    for (const action of this.ast.actions) {
      const existing = seen.get(action.name);
      if (existing) {
        this.error(
          action.location,
          "AXL301",
          `Duplicate action "${action.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(action.name, action);
      }
    }
  }

  private checkDuplicateWorkflows(): void {
    const seen = new Map<string, WorkflowNode>();
    for (const workflow of this.ast.workflows) {
      const existing = seen.get(workflow.name);
      if (existing) {
        this.error(
          workflow.location,
          "AXL302",
          `Duplicate workflow "${workflow.name}". First defined at ${this.formatLoc(existing.location)}`,
        );
      } else {
        seen.set(workflow.name, workflow);
      }
    }
  }

  private checkDuplicateFields(): void {
    for (const entity of this.ast.entities) {
      const seen = new Set<string>();
      for (const field of entity.fields) {
        if (seen.has(field.name)) {
          this.error(
            field.location,
            "AXL303",
            `Duplicate field "${field.name}" in entity "${entity.name}"`,
          );
        } else {
          seen.add(field.name);
        }
      }
    }

    // Also check duplicate input fields within actions
    for (const action of this.ast.actions) {
      const seen = new Set<string>();
      for (const input of action.inputs) {
        if (seen.has(input.name)) {
          this.error(
            input.location,
            "AXL304",
            `Duplicate input field "${input.name}" in action "${action.name}"`,
          );
        } else {
          seen.add(input.name);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Type reference checks
  // -------------------------------------------------------------------------

  private checkEntityTypeReferences(): void {
    for (const entity of this.ast.entities) {
      for (const field of entity.fields) {
        this.validateTypeRef(field.type, `field "${field.name}" in entity "${entity.name}"`);
      }
    }
  }

  private checkActionOutputTypes(): void {
    for (const action of this.ast.actions) {
      this.validateTypeRef(action.output, `output of action "${action.name}"`);
    }
  }

  private checkActionInputTypes(): void {
    for (const action of this.ast.actions) {
      for (const input of action.inputs) {
        this.validateTypeRef(input.type, `input "${input.name}" of action "${action.name}"`);
      }
    }
  }

  private validateTypeRef(typeRef: TypeRef, context: string): void {
    const { name } = typeRef;

    // Generic types like List<T>
    if (GENERIC_TYPES.has(name)) {
      if (typeRef.typeArgument) {
        this.validateTypeRef(typeRef.typeArgument, context);
      }
      return;
    }

    // Primitive types
    if (PRIMITIVE_TYPES.has(name)) {
      return;
    }

    // Must be an entity reference
    if (!this.entityNames.has(name)) {
      const suggestion = this.findSimilar(name, this.entityNames);
      this.error(
        typeRef.location,
        "AXL310",
        `Unknown type "${name}" in ${context}`,
        suggestion ? `Did you mean "${suggestion}"?` : undefined,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Missing required sections
  // -------------------------------------------------------------------------

  private checkMissingOutputs(): void {
    for (const action of this.ast.actions) {
      if (!action.output || action.output.name === "") {
        this.error(
          action.location,
          "AXL320",
          `Action "${action.name}" is missing an OUTPUT declaration`,
        );
      }
    }
  }

  private checkMissingEndpoints(): void {
    for (const action of this.ast.actions) {
      if (!action.endpoint || action.endpoint.path === "/") {
        // Only warn if endpoint was defaulted (path is exactly "/")
        this.warn(
          action.location,
          "AXL321",
          `Action "${action.name}" has no ENDPOINT declaration. Defaulting to GET /`,
        );
      }
    }
  }

  private checkMissingPermissions(): void {
    const permittedActions = new Set(
      this.ast.auth.permissions.map((p: PermissionNode) => p.actionRef),
    );
    for (const action of this.ast.actions) {
      if (!permittedActions.has(action.name)) {
        this.error(
          action.location,
          "AXL322",
          `Action "${action.name}" has no PERMISSION entry in auth.flow. Every action must have an explicit permission level.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Action reference checks
  // -------------------------------------------------------------------------

  private checkWorkflowActionReferences(): void {
    for (const workflow of this.ast.workflows) {
      for (const step of workflow.steps) {
        if (!this.actionNames.has(step.actionRef)) {
          const suggestion = this.findSimilar(step.actionRef, this.actionNames);
          this.error(
            step.location,
            "AXL330",
            `Workflow "${workflow.name}" references unknown action "${step.actionRef}"`,
            suggestion ? `Did you mean "${suggestion}"?` : undefined,
          );
        }
      }
    }
  }

  private checkPermissionActionReferences(): void {
    for (const perm of this.ast.auth.permissions) {
      if (!this.actionNames.has(perm.actionRef)) {
        const suggestion = this.findSimilar(perm.actionRef, this.actionNames);
        this.error(
          perm.location,
          "AXL331",
          `PERMISSION references unknown action "${perm.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  private checkConfirmationActionReferences(): void {
    for (const conf of this.ast.auth.confirmations) {
      if (!this.actionNames.has(conf.actionRef)) {
        const suggestion = this.findSimilar(conf.actionRef, this.actionNames);
        this.error(
          conf.location,
          "AXL332",
          `CONFIRM references unknown action "${conf.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  private checkRateLimitActionReferences(): void {
    for (const rl of this.ast.auth.rateLimits) {
      if (!this.actionNames.has(rl.actionRef)) {
        const suggestion = this.findSimilar(rl.actionRef, this.actionNames);
        this.error(
          rl.location,
          "AXL333",
          `RATE_LIMIT references unknown action "${rl.actionRef}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Circular reference detection
  // -------------------------------------------------------------------------

  private checkCircularEntityReferences(): void {
    // Build an adjacency list: entity → entities it references
    const graph = new Map<string, Set<string>>();
    for (const entity of this.ast.entities) {
      const refs = new Set<string>();
      for (const field of entity.fields) {
        this.collectEntityRefsFromType(field.type, refs);
      }
      graph.set(entity.name, refs);
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat(node);
        const entityNode = this.ast.entities.find(e => e.name === node);
        if (entityNode) {
          this.error(
            entityNode.location,
            "AXL340",
            `Circular entity reference detected: ${cycle.join(" → ")}`,
          );
        }
        return true;
      }

      if (visited.has(node)) return false;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const refs = graph.get(node);
      if (refs) {
        for (const ref of refs) {
          if (graph.has(ref)) {
            dfs(ref, path);
          }
        }
      }

      inStack.delete(node);
      path.pop();
      return false;
    };

    for (const entityName of graph.keys()) {
      if (!visited.has(entityName)) {
        dfs(entityName, []);
      }
    }
  }

  private collectEntityRefsFromType(typeRef: TypeRef, refs: Set<string>): void {
    const { name } = typeRef;
    if (!PRIMITIVE_TYPES.has(name) && !GENERIC_TYPES.has(name)) {
      refs.add(name);
    }
    if (typeRef.typeArgument) {
      this.collectEntityRefsFromType(typeRef.typeArgument, refs);
    }
  }

  // -------------------------------------------------------------------------
  // "Did you mean?" suggestions (Levenshtein distance)
  // -------------------------------------------------------------------------

  private findSimilar(name: string, candidates: Set<string>): string | undefined {
    let best: string | undefined;
    let bestDistance = Infinity;
    const threshold = Math.max(2, Math.floor(name.length / 2));

    for (const candidate of candidates) {
      const distance = this.levenshtein(name.toLowerCase(), candidate.toLowerCase());
      if (distance < bestDistance && distance <= threshold) {
        bestDistance = distance;
        best = candidate;
      }
    }

    return best;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }

    return dp[m]![n]!;
  }

  // -------------------------------------------------------------------------
  // Diagnostic helpers
  // -------------------------------------------------------------------------

  private error(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code,
      message,
      location,
      suggestion,
    });
  }

  private warn(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      code,
      message,
      location,
      suggestion,
    });
  }

  private formatLoc(loc: SourceLocation): string {
    return `${loc.file}:${loc.line}:${loc.column}`;
  }
}
