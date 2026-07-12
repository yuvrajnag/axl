// ============================================================================
// packages/compiler/types.ts — Core type definitions for the AXL compiler
// ============================================================================
// Every type used across the compiler pipeline is defined here.
// No module in the compiler should define its own ad-hoc types.
// ============================================================================

// ---------------------------------------------------------------------------
// Source Tracking
// ---------------------------------------------------------------------------

/** A precise location within a .flow source file. */
export interface SourceLocation {
  /** The file path (relative or absolute, as provided to the compiler). */
  readonly file: string;
  /** 1-indexed line number. */
  readonly line: number;
  /** 1-indexed column number. */
  readonly column: number;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Every distinct lexeme the AXL lexer can produce.
 *
 * .flow is a declarative specification language — there are no braces,
 * parentheses, semicolons, or operator tokens beyond `:` and `/`.
 */
export enum TokenType {
  // Literals
  Identifier      = "Identifier",
  StringLiteral   = "StringLiteral",
  NumberLiteral   = "NumberLiteral",
  VersionLiteral  = "VersionLiteral",

  // Keywords (reserved words in the AXL language)
  Keyword         = "Keyword",

  // Punctuation
  Colon           = "Colon",          // :
  Slash           = "Slash",          // /
  LeftAngle       = "LeftAngle",      // <
  RightAngle      = "RightAngle",     // >
  LeftBrace       = "LeftBrace",      // {
  RightBrace      = "RightBrace",     // }
  Dot             = "Dot",            // .
  Dash            = "Dash",           // -
  Question        = "Question",       // ?
  Equals          = "Equals",         // =
  Ampersand       = "Ampersand",      // &
  Comma           = "Comma",          // ,

  // Structural
  Newline         = "Newline",
  EOF             = "EOF",

  // Trivia (optionally preserved for tooling)
  Comment         = "Comment",
}

/** A single token produced by the lexer. */
export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly location: SourceLocation;
}

/**
 * The complete set of reserved keywords in the AXL language.
 *
 * These words CANNOT be used as identifiers. They are case-sensitive
 * and always uppercase (except type names and HTTP methods).
 */
export const KEYWORDS = new Set<string>([
  // App-level
  "APP", "NAME", "VERSION", "DESCRIPTION", "FRAMEWORK",
  "LANGUAGE", "DATABASE", "BASE_URL", "GENERATORS",

  // Schema
  "ENTITY", "RELATION",

  // Actions
  "ACTION", "DESC", "INPUT", "OUTPUT", "ENDPOINT",

  // Modifiers
  "REQUIRED", "OPTIONAL",

  // Workflows
  "WORKFLOW", "STEP", "END", "IF", "ELSE", "USING",

  // Auth
  "PERMISSION", "CONFIRM", "RATE_LIMIT",

  // Permission levels
  "PUBLIC", "AUTH",

  // Confirmation methods
  "OTP",

  // HTTP methods (used after ENDPOINT)
  "GET", "POST", "PUT", "PATCH", "DELETE",
]);

/** Primitive type names recognised by the AXL type system. */
export const PRIMITIVE_TYPES = new Set<string>([
  "String", "Number", "Float", "Boolean", "Null",
]);

/** Generic container type names. */
export const GENERIC_TYPES = new Set<string>([
  "List",
]);

/** HTTP methods supported in ENDPOINT declarations. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const HTTP_METHODS = new Set<string>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const RESERVED_GENERATORS = new Set([
  "MCP",
  "OPENAPI",
  "DIAGRAM",
  "AGENT",
  "DOCS",
  "SDK_TS",
  "SDK_JAVA",
  "SDK_PYTHON",
]);

// ---------------------------------------------------------------------------
// Type References (for fields, inputs, outputs)
// ---------------------------------------------------------------------------

/** A reference to a type — either a simple name or a generic like List<T>. */
export interface TypeRef {
  /** The type name, e.g. "String", "Product", "List". */
  readonly name: string;
  /** For generics like List<Product>, the inner type argument. */
  readonly typeArgument?: TypeRef;
  readonly location: SourceLocation;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export enum DiagnosticSeverity {
  Error   = "error",
  Warning = "warning",
  Info    = "info",
}

/**
 * A compiler diagnostic.
 *
 * Formatted to match TypeScript-style error output:
 *   schema.flow:12:5 - error AXL001: Unknown entity "Foo". Did you mean "Food"?
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly location: SourceLocation;
  readonly suggestion?: string;
}

// ---------------------------------------------------------------------------
// Manifest (compiler output)
// ---------------------------------------------------------------------------

export interface ManifestApp {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly framework: string;
  readonly language: string;
  readonly database: string;
  readonly base_url: string;
  readonly generators?: string[];
}

export interface ManifestField {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly relation?: string;
}

export interface ManifestEntity {
  readonly name: string;
  readonly fields: ManifestField[];
}

export interface ManifestEndpoint {
  readonly method: HttpMethod;
  readonly path: string;
}

export interface ManifestInputField {
  readonly type: string;
  readonly required: boolean;
}

export interface ManifestAction {
  readonly description: string;
  readonly input: Record<string, ManifestInputField>;
  readonly output: string;
  readonly endpoint: ManifestEndpoint;
  readonly permission: string;
  readonly confirm: string | null;
}

export interface ManifestStepBinding {
  readonly targetField: string;
  readonly sourceStep: string;
  readonly sourceField: string;
}

export interface ManifestActionStep {
  readonly action: string;
  readonly bindings?: ManifestStepBinding[];
}

export type ManifestStep = string | ManifestActionStep | ManifestBranch;

export interface ManifestBranch {
  readonly if: string;
  readonly then: ManifestStep[];
  readonly else?: ManifestStep[];
}

export interface ManifestWorkflow {
  readonly name: string;
  readonly steps: ManifestStep[];
}

export interface ManifestRateLimit {
  readonly action: string;
  readonly limit: string;
}

/**
 * The final compiled manifest — the single output of the AXL compiler
 * and the single input to the AXL runtime engine.
 */
export interface Manifest {
  readonly app: ManifestApp;
  readonly entities: ManifestEntity[];
  readonly actions: Record<string, ManifestAction>;
  readonly workflows: ManifestWorkflow[];
  readonly permissions: Record<string, string>;
  readonly rateLimits: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Compiler Result
// ---------------------------------------------------------------------------

export interface CompileResult {
  readonly success: boolean;
  readonly diagnostics: Diagnostic[];
  readonly manifest?: Manifest;
  readonly manifestPath?: string;
}
