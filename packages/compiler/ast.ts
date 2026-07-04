// ============================================================================
// packages/compiler/ast.ts — AST node definitions for the AXL language
// ============================================================================
// Each .flow file type produces its own AST node type.
// All nodes carry a SourceLocation for diagnostic reporting.
// ============================================================================

import type { SourceLocation, TypeRef, HttpMethod } from "./types.js";

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Discriminated union tag for AST nodes. */
export type NodeKind =
  | "App"
  | "Entity"
  | "Field"
  | "Action"
  | "InputField"
  | "Endpoint"
  | "Workflow"
  | "Step"
  | "Permission"
  | "Confirmation"
  | "RateLimit";

/** Base interface for all AST nodes. */
export interface BaseNode {
  readonly kind: NodeKind;
  readonly location: SourceLocation;
}

// ---------------------------------------------------------------------------
// app.flow
// ---------------------------------------------------------------------------

export interface AppNode extends BaseNode {
  readonly kind: "App";
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly framework: string;
  readonly language: string;
  readonly database: string;
  readonly baseUrl: string;
  readonly generators: string[];
}

// ---------------------------------------------------------------------------
// schema.flow
// ---------------------------------------------------------------------------

export interface FieldNode extends BaseNode {
  readonly kind: "Field";
  readonly name: string;
  readonly type: TypeRef;
}

export interface EntityNode extends BaseNode {
  readonly kind: "Entity";
  readonly name: string;
  readonly fields: readonly FieldNode[];
}

// ---------------------------------------------------------------------------
// actions.flow
// ---------------------------------------------------------------------------

export interface InputFieldNode extends BaseNode {
  readonly kind: "InputField";
  readonly name: string;
  readonly type: TypeRef;
  readonly required: boolean;
}

export interface EndpointNode extends BaseNode {
  readonly kind: "Endpoint";
  readonly method: HttpMethod;
  readonly path: string;
}

export interface ActionNode extends BaseNode {
  readonly kind: "Action";
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly InputFieldNode[];
  readonly output: TypeRef;
  readonly endpoint: EndpointNode;
}

// ---------------------------------------------------------------------------
// workflows.flow
// ---------------------------------------------------------------------------

export interface StepNode extends BaseNode {
  readonly kind: "Step";
  readonly actionRef: string;
}

export interface WorkflowNode extends BaseNode {
  readonly kind: "Workflow";
  readonly name: string;
  readonly steps: readonly StepNode[];
}

// ---------------------------------------------------------------------------
// auth.flow
// ---------------------------------------------------------------------------

export interface PermissionNode extends BaseNode {
  readonly kind: "Permission";
  readonly actionRef: string;
  readonly level: "PUBLIC" | "AUTH";
}

export interface ConfirmationNode extends BaseNode {
  readonly kind: "Confirmation";
  readonly actionRef: string;
  readonly method: "OTP";
}

export interface RateLimitNode extends BaseNode {
  readonly kind: "RateLimit";
  readonly actionRef: string;
  readonly limit: string;
}

// ---------------------------------------------------------------------------
// Aggregate AST (output of parsing all 5 files)
// ---------------------------------------------------------------------------

export interface AuthAST {
  readonly permissions: readonly PermissionNode[];
  readonly confirmations: readonly ConfirmationNode[];
  readonly rateLimits: readonly RateLimitNode[];
}

/**
 * The complete AST for an AXL project — one of each file type's AST
 * combined into a single structure for semantic validation.
 */
export interface ProjectAST {
  readonly app: AppNode;
  readonly entities: readonly EntityNode[];
  readonly actions: readonly ActionNode[];
  readonly workflows: readonly WorkflowNode[];
  readonly auth: AuthAST;
}
