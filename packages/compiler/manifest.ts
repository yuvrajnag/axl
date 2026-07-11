// ============================================================================
// packages/compiler/manifest.ts — AST → Manifest JSON transformer
// ============================================================================
// Transforms the validated ProjectAST into the final Manifest structure.
// The manifest is the sole contract between the compiler and the runtime.
//
// The output shape is designed to be directly consumable by engine.js
// without any further transformation.
// ============================================================================

import type {
  Manifest,
  ManifestApp,
  ManifestEntity,
  ManifestField,
  ManifestAction,
  ManifestInputField,
  ManifestEndpoint,
  ManifestWorkflow,
  TypeRef,
  HttpMethod,
} from "./types.js";
import type {
  ProjectAST,
  PermissionNode,
  ConfirmationNode,
  RateLimitNode,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Manifest Generator
// ---------------------------------------------------------------------------

export class ManifestGenerator {
  private readonly ast: ProjectAST;

  constructor(ast: ProjectAST) {
    this.ast = ast;
  }

  generate(): Manifest {
    return {
      app: this.buildApp(),
      entities: this.buildEntities(),
      actions: this.buildActions(),
      workflows: this.buildWorkflows(),
      permissions: this.buildPermissions(),
      rateLimits: this.buildRateLimits(),
    };
  }

  // -------------------------------------------------------------------------
  // Builders
  // -------------------------------------------------------------------------

  private buildApp(): ManifestApp {
    const { app } = this.ast;
    return {
      name: app.name,
      displayName: app.displayName,
      version: app.version,
      description: app.description,
      framework: app.framework,
      language: app.language,
      database: app.database,
      base_url: app.baseUrl,
      generators: app.generators,
    };
  }

  private buildEntities(): ManifestEntity[] {
    return this.ast.entities.map(entity => ({
      name: entity.name,
      fields: entity.fields.map(field => this.buildField(field.name, field.type, field.relation)),
    }));
  }

  private buildField(name: string, type: TypeRef, relation?: string): ManifestField {
    return {
      name,
      type: this.serializeTypeRef(type),
      ...(relation ? { relation } : {}),
    };
  }

  private buildActions(): Record<string, ManifestAction> {
    const permissionMap = new Map<string, string>();
    for (const perm of this.ast.auth.permissions) {
      permissionMap.set(perm.actionRef, perm.level);
    }

    const confirmMap = new Map<string, string>();
    for (const conf of this.ast.auth.confirmations) {
      confirmMap.set(conf.actionRef, conf.method);
    }

    const actions: Record<string, ManifestAction> = {};

    for (const action of this.ast.actions) {
      const input: Record<string, ManifestInputField> = {};
      for (const inp of action.inputs) {
        input[inp.name] = {
          type: this.serializeTypeRef(inp.type).toLowerCase(),
          required: inp.required,
        };
      }

      const endpoint: ManifestEndpoint = {
        method: action.endpoint.method,
        path: action.endpoint.path,
      };

      actions[action.name] = {
        description: action.description,
        input,
        output: this.serializeTypeRef(action.output),
        endpoint,
        permission: permissionMap.get(action.name) ?? "PUBLIC",
        confirm: confirmMap.get(action.name) ?? null,
      };
    }

    return actions;
  }

  private buildWorkflows(): ManifestWorkflow[] {
    return this.ast.workflows.map(workflow => ({
      name: workflow.name,
      steps: this.buildSteps(workflow.steps),
    }));
  }

  private buildSteps(steps: readonly import("./ast.js").StepNode[]): import("./types.js").ManifestStep[] {
    return steps.map(step => {
      if (step.kind === "Step") {
        return step.actionRef;
      } else {
        return {
          if: step.condition,
          then: this.buildSteps(step.trueSteps),
          ...(step.falseSteps ? { else: this.buildSteps(step.falseSteps) } : {})
        };
      }
    });
  }

  private buildPermissions(): Record<string, string> {
    const perms: Record<string, string> = {};
    for (const perm of this.ast.auth.permissions) {
      perms[perm.actionRef] = perm.level;
    }
    return perms;
  }

  private buildRateLimits(): Record<string, string> {
    const limits: Record<string, string> = {};
    for (const rl of this.ast.auth.rateLimits) {
      limits[rl.actionRef] = rl.limit;
    }
    return limits;
  }

  // -------------------------------------------------------------------------
  // Type serialisation
  // -------------------------------------------------------------------------

  private serializeTypeRef(typeRef: TypeRef): string {
    if (typeRef.typeArgument) {
      return `${typeRef.name}<${this.serializeTypeRef(typeRef.typeArgument)}>`;
    }
    return typeRef.name;
  }
}
