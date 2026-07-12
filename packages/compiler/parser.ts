// ============================================================================
// packages/compiler/parser.ts — Recursive-descent parser for .flow files
// ============================================================================
// Each .flow file type has its own entry point. The parser consumes tokens
// from the lexer and builds typed AST nodes.
//
// File type detection:
//   First keyword token → determines which parse method to call
//   APP        → parseAppFile
//   ENTITY     → parseSchemaFile
//   ACTION     → parseActionsFile
//   WORKFLOW   → parseWorkflowsFile
//   PERMISSION → parseAuthFile
//   CONFIRM    → parseAuthFile
//   RATE_LIMIT → parseAuthFile
//
// Error recovery:
//   On unexpected token → skip to next top-level keyword, emit diagnostic
// ============================================================================

import { Lexer } from "./lexer.js";
import type {
  Token,
  SourceLocation,
  Diagnostic,
  TypeRef,
  HttpMethod,
} from "./types.js";
import {
  TokenType,
  DiagnosticSeverity,
  HTTP_METHODS,
} from "./types.js";
import type {
  AppNode,
  EntityNode,
  FieldNode,
  ActionNode,
  InputFieldNode,
  EndpointNode,
  WorkflowNode,
  StepNode,
  PermissionNode,
  ConfirmationNode,
  RateLimitNode,
  AuthAST,
} from "./ast.js";

// ---------------------------------------------------------------------------
// Top-level keywords that start blocks
// ---------------------------------------------------------------------------

const TOP_LEVEL_KEYWORDS = new Set([
  "APP", "ENTITY", "ACTION", "WORKFLOW", "PERMISSION", "CONFIRM", "RATE_LIMIT",
]);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class Parser {
  private readonly tokens: Token[];
  private readonly diagnostics: Diagnostic[];
  private pos: number = 0;
  private readonly fileName: string;

  constructor(source: string, fileName: string) {
    const lexer = new Lexer(source, fileName);
    const result = lexer.tokenize();
    this.tokens = result.tokens;
    this.diagnostics = [...result.diagnostics];
    this.fileName = fileName;
  }

  getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  // -------------------------------------------------------------------------
  // File-type detection
  // -------------------------------------------------------------------------

  /**
   * Detects file type from the first keyword and delegates to the
   * appropriate parser. Returns a discriminated result.
   */
  detectAndParse(): ParseResult {
    this.skipNewlines();
    this.skipComments();
    this.skipNewlines();

    const first = this.peek();

    if (first.type === TokenType.EOF) {
      this.addDiagnostic(first.location, "AXL200", "Empty file");
      return { type: "empty", diagnostics: this.diagnostics };
    }

    if (first.type === TokenType.Keyword) {
      switch (first.value) {
        case "APP":
          return { type: "app", node: this.parseAppFile(), diagnostics: this.diagnostics };
        case "ENTITY":
          return { type: "schema", nodes: this.parseSchemaFile(), diagnostics: this.diagnostics };
        case "ACTION":
          return { type: "actions", nodes: this.parseActionsFile(), diagnostics: this.diagnostics };
        case "WORKFLOW":
          return { type: "workflows", nodes: this.parseWorkflowsFile(), diagnostics: this.diagnostics };
        case "PERMISSION":
        case "CONFIRM":
        case "RATE_LIMIT":
          return { type: "auth", auth: this.parseAuthFile(), diagnostics: this.diagnostics };
      }
    }

    this.addDiagnostic(
      first.location,
      "AXL201",
      `Expected a top-level keyword (APP, ENTITY, ACTION, WORKFLOW, PERMISSION), got '${first.value}'`,
    );
    return { type: "empty", diagnostics: this.diagnostics };
  }

  // -------------------------------------------------------------------------
  // app.flow
  // -------------------------------------------------------------------------

  parseAppFile(): AppNode {
    const loc = this.peek().location;
    this.expectKeyword("APP");
    const name = this.expectIdentifier("application name");
    this.skipNewlines();

    let displayName = name;
    let version = "0.0.0";
    let description = "";
    let framework = "";
    let language = "";
    let database = "";
    let baseUrl = "";
    let generators: string[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) break;

      switch (kw.value) {
        case "NAME":
          this.advance();
          displayName = this.expectString("application display name");
          break;
        case "VERSION":
          this.advance();
          version = this.expectVersionOrNumber("version");
          break;
        case "DESCRIPTION":
          this.advance();
          description = this.expectString("description");
          break;
        case "FRAMEWORK":
          this.advance();
          framework = this.expectIdentifier("framework name");
          break;
        case "LANGUAGE":
          this.advance();
          language = this.expectIdentifier("language name");
          break;
        case "DATABASE":
          this.advance();
          database = this.expectIdentifier("database name");
          break;
        case "BASE_URL":
          this.advance();
          baseUrl = this.scanUrlValue();
          break;
        case "GENERATORS":
          this.advance();
          this.skipNewlines();
          // Read identifiers until we hit EOF, next keyword, etc.
          while (!this.isAtEnd()) {
            this.skipNewlines();
            this.skipComments();
            if (this.isAtEnd()) break;
            const next = this.peek();
            // A top-level keyword or app-level keyword breaks the block
            if (next.type === TokenType.Keyword) break;
            if (next.type === TokenType.Identifier) {
              generators.push(next.value);
              this.advance();
            } else {
              break; // unknown token, handled by the loop or outer loop
            }
          }
          break;
        default:
          // Unknown keyword in app context — stop parsing
          this.addDiagnostic(kw.location, "AXL202", `Unexpected keyword '${kw.value}' in app definition`);
          this.advance();
          break;
      }
      this.skipNewlines();
    }

    return {
      kind: "App",
      location: loc,
      name,
      displayName,
      version,
      description,
      framework,
      language,
      database,
      baseUrl,
      generators,
    };
  }

  // -------------------------------------------------------------------------
  // schema.flow
  // -------------------------------------------------------------------------

  parseSchemaFile(): EntityNode[] {
    const entities: EntityNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("ENTITY")) {
        entities.push(this.parseEntity());
      } else {
        this.addDiagnostic(this.peek().location, "AXL210", `Expected 'ENTITY', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return entities;
  }

  private parseEntity(): EntityNode {
    const loc = this.peek().location;
    this.expectKeyword("ENTITY");
    const name = this.expectIdentifier("entity name");
    this.skipNewlines();

    const fields: FieldNode[] = [];
    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd() || this.isAtTopLevel()) break;

      // A field line: name : Type
      if (this.peek().type === TokenType.Identifier) {
        fields.push(this.parseField());
      } else if (this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
        this.addDiagnostic(this.peek().location, "AXL211", `Expected field name, got '${this.peek().value}'`);
        this.advance();
      }
    }

    return { kind: "Entity", location: loc, name, fields };
  }

  private parseField(): FieldNode {
    const loc = this.peek().location;
    const name = this.expectIdentifier("field name");
    this.expectColon();
    const type = this.parseTypeRef();

    let relation: string | undefined;
    if (!this.isAtEnd() && this.peekKeyword("RELATION")) {
      this.advance();
      const relToken = this.peek();
      if (relToken.type === TokenType.Identifier || relToken.type === TokenType.Keyword) {
         relation = relToken.value;
         this.advance();
      } else {
         this.addDiagnostic(relToken.location, "AXL251", `Expected 'one' or 'many' after RELATION, got '${relToken.value}'`);
         if (relToken.type !== TokenType.Newline && relToken.type !== TokenType.EOF) {
           this.advance();
         }
      }
    }

    this.skipNewlines();
    return { kind: "Field", location: loc, name, type, relation };
  }

  // -------------------------------------------------------------------------
  // actions.flow
  // -------------------------------------------------------------------------

  parseActionsFile(): ActionNode[] {
    const actions: ActionNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("ACTION")) {
        actions.push(this.parseAction());
      } else {
        this.addDiagnostic(this.peek().location, "AXL220", `Expected 'ACTION', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return actions;
  }

  private parseAction(): ActionNode {
    const loc = this.peek().location;
    this.expectKeyword("ACTION");
    const name = this.expectIdentifier("action name");
    this.skipNewlines();

    let description = "";
    let inputs: InputFieldNode[] = [];
    let output: TypeRef = { name: "Null", location: loc };
    let endpoint: EndpointNode = {
      kind: "Endpoint",
      location: loc,
      method: "GET",
      path: "/",
    };

    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd() || this.isAtTopLevel()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) {
        if (kw.type !== TokenType.Newline && kw.type !== TokenType.EOF) {
          this.addDiagnostic(kw.location, "AXL221", `Expected DESC, INPUT, OUTPUT, or ENDPOINT, got '${kw.value}'`);
          this.advance();
        }
        continue;
      }

      switch (kw.value) {
        case "DESC":
          this.advance();
          description = this.expectString("action description");
          break;
        case "INPUT":
          this.advance();
          this.skipNewlines();
          inputs = this.parseInputFields();
          break;
        case "OUTPUT":
          this.advance();
          output = this.parseTypeRef();
          break;
        case "ENDPOINT":
          this.advance();
          endpoint = this.parseEndpoint(kw.location);
          break;
        default:
          // Hit a top-level keyword that belongs to a new block — stop
          return {
            kind: "Action",
            location: loc,
            name,
            description,
            inputs,
            output,
            endpoint,
          };
      }
      this.skipNewlines();
    }

    return {
      kind: "Action",
      location: loc,
      name,
      description,
      inputs,
      output,
      endpoint,
    };
  }

  private parseInputFields(): InputFieldNode[] {
    const fields: InputFieldNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd()) break;

      // Check if we've hit a keyword that ends the INPUT section
      const next = this.peek();
      if (next.type === TokenType.Keyword && (
        next.value === "OUTPUT" || next.value === "ENDPOINT" ||
        next.value === "DESC" || next.value === "ACTION" ||
        TOP_LEVEL_KEYWORDS.has(next.value)
      )) {
        break;
      }

      if (next.type === TokenType.Identifier) {
        const fieldLoc = next.location;
        const name = this.expectIdentifier("input field name");
        this.expectColon();
        const type = this.parseTypeRef();

        // Check for REQUIRED / OPTIONAL modifier
        let required = false;
        if (!this.isAtEnd() && this.peek().type === TokenType.Keyword) {
          if (this.peek().value === "REQUIRED") {
            required = true;
            this.advance();
          } else if (this.peek().value === "OPTIONAL") {
            required = false;
            this.advance();
          }
        }

        fields.push({
          kind: "InputField",
          location: fieldLoc,
          name,
          type,
          required,
        });
      } else if (next.type !== TokenType.Newline && next.type !== TokenType.EOF) {
        break;
      }
    }

    return fields;
  }

  private parseEndpoint(loc: SourceLocation): EndpointNode {
    // ENDPOINT <METHOD> <PATH>
    const methodToken = this.peek();
    let method: HttpMethod = "GET";
    if (methodToken.type === TokenType.Keyword && HTTP_METHODS.has(methodToken.value)) {
      method = methodToken.value as HttpMethod;
      this.advance();
    } else {
      this.addDiagnostic(
        methodToken.location,
        "AXL222",
        `Expected HTTP method (GET, POST, PUT, PATCH, DELETE), got '${methodToken.value}'`,
      );
    }

    const path = this.scanPathValue();

    return { kind: "Endpoint", location: loc, method, path };
  }

  // -------------------------------------------------------------------------
  // workflows.flow
  // -------------------------------------------------------------------------

  parseWorkflowsFile(): WorkflowNode[] {
    const workflows: WorkflowNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.peekKeyword("WORKFLOW")) {
        workflows.push(this.parseWorkflow());
      } else {
        this.addDiagnostic(this.peek().location, "AXL230", `Expected 'WORKFLOW', got '${this.peek().value}'`);
        this.skipToNextTopLevel();
      }
    }

    return workflows;
  }

  private parseWorkflow(): WorkflowNode {
    const loc = this.peek().location;
    this.expectKeyword("WORKFLOW");
    const name = this.expectIdentifier("workflow name");
    this.skipNewlines();

    const steps = this.parseSteps(new Set(["END"]));
    if (this.peekKeyword("END")) {
      this.advance();
    }
    return { kind: "Workflow", location: loc, name, steps };
  }

  private parseSteps(terminators: Set<string>): StepNode[] {
    const steps: StepNode[] = [];
    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      if (this.isAtEnd()) break;

      const peekToken = this.peek();
      if (peekToken.type === TokenType.Keyword && terminators.has(peekToken.value)) {
        break;
      }

      if (this.peekKeyword("WORKFLOW")) {
        break;
      }

      if (this.peekKeyword("STEP")) {
        const stepLoc = this.peek().location;
        this.advance();
        const actionRef = this.expectIdentifier("action reference");
        
        let bindings: import("./ast.js").StepBinding[] | undefined;
        if (!this.isAtEnd() && this.peekKeyword("USING")) {
          this.advance(); // consume USING
          bindings = [];
          
          while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
            const targetField = this.expectIdentifier("target field");
            
            if (this.peek().type === TokenType.Equals) {
              this.advance();
            } else {
              this.addDiagnostic(this.peek().location, "AXL233", "Expected '=' after target field in binding");
              break;
            }
            
            const sourceStep = this.expectIdentifier("source step");
            
            let sourceField = "";
            if (!this.isAtEnd() && this.peek().type === TokenType.Dot) {
              this.advance(); // consume .
              sourceField = this.expectIdentifier("source field");
            } else {
              this.addDiagnostic(this.peek().location, "AXL234", "Expected '.' after source step in binding");
            }
            
            bindings.push({ targetField, sourceStep, sourceField });
            
            if (!this.isAtEnd() && this.peek().type === TokenType.Comma) {
              this.advance(); // consume comma
              continue;
            } else {
              break; // no comma means end of bindings list
            }
          }
        }
        
        steps.push({ kind: "Step", location: stepLoc, actionRef, bindings });
      } else if (this.peekKeyword("IF")) {
        const stepLoc = this.peek().location;
        this.advance();
        let condition = this.expectIdentifier("condition");
        if (!this.isAtEnd() && this.peek().type === TokenType.Dot) {
          this.advance();
          condition += "." + this.expectIdentifier("condition property");
        }
        this.skipNewlines();
        const trueSteps = this.parseSteps(new Set(["ELSE", "END"]));
        let falseSteps: StepNode[] | undefined;
        if (this.peekKeyword("ELSE")) {
          this.advance();
          this.skipNewlines();
          falseSteps = this.parseSteps(new Set(["END"]));
        }
        if (this.peekKeyword("END")) {
          this.advance();
        } else {
          this.addDiagnostic(this.peek().location, "AXL232", `Expected 'END' to close IF block`);
        }
        steps.push({ kind: "BranchStep", location: stepLoc, condition, trueSteps, falseSteps });
      } else if (peekToken.type !== TokenType.Newline && peekToken.type !== TokenType.EOF) {
        this.addDiagnostic(peekToken.location, "AXL231", `Expected 'STEP', 'IF', or 'END', got '${peekToken.value}'`);
        this.advance();
      }
    }
    return steps;
  }

  // -------------------------------------------------------------------------
  // auth.flow
  // -------------------------------------------------------------------------

  parseAuthFile(): AuthAST {
    const permissions: PermissionNode[] = [];
    const confirmations: ConfirmationNode[] = [];
    const rateLimits: RateLimitNode[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      this.skipComments();
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const kw = this.peek();
      if (kw.type !== TokenType.Keyword) {
        if (kw.type !== TokenType.Newline && kw.type !== TokenType.EOF) {
          this.addDiagnostic(kw.location, "AXL240", `Expected PERMISSION, CONFIRM, or RATE_LIMIT, got '${kw.value}'`);
          this.advance();
        }
        continue;
      }

      switch (kw.value) {
        case "PERMISSION": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          const levelToken = this.peek();
          let level: "PUBLIC" | "AUTH" = "PUBLIC";
          if (levelToken.type === TokenType.Keyword && (levelToken.value === "PUBLIC" || levelToken.value === "AUTH")) {
            level = levelToken.value;
            this.advance();
          } else {
            this.addDiagnostic(levelToken.location, "AXL241", `Expected 'PUBLIC' or 'AUTH', got '${levelToken.value}'`);
            this.advance();
          }
          permissions.push({ kind: "Permission", location: loc, actionRef, level });
          break;
        }
        case "CONFIRM": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          const methodToken = this.peek();
          let method: "OTP" = "OTP";
          if (methodToken.type === TokenType.Keyword && methodToken.value === "OTP") {
            this.advance();
          } else {
            this.addDiagnostic(methodToken.location, "AXL242", `Expected 'OTP', got '${methodToken.value}'`);
            this.advance();
          }
          confirmations.push({ kind: "Confirmation", location: loc, actionRef, method });
          break;
        }
        case "RATE_LIMIT": {
          const loc = kw.location;
          this.advance();
          const actionRef = this.expectIdentifier("action name");
          this.expectColon();
          // Parse rate limit value like 5/min
          const limit = this.scanRateLimitValue();
          rateLimits.push({ kind: "RateLimit", location: loc, actionRef, limit });
          break;
        }
        default:
          this.addDiagnostic(kw.location, "AXL243", `Unexpected keyword '${kw.value}' in auth file`);
          this.advance();
          break;
      }
    }

    return { permissions, confirmations, rateLimits };
  }

  // -------------------------------------------------------------------------
  // Type reference parsing
  // -------------------------------------------------------------------------

  private parseTypeRef(): TypeRef {
    const loc = this.peek().location;

    // Could be: String | Number | Float | Boolean | Null | EntityName | List<T>
    const name = this.expectIdentifier("type name");

    // Check for generic: List<Product>
    if (!this.isAtEnd() && this.peek().type === TokenType.LeftAngle) {
      this.advance(); // consume <
      const typeArgument = this.parseTypeRef();
      if (!this.isAtEnd() && this.peek().type === TokenType.RightAngle) {
        this.advance(); // consume >
      } else {
        this.addDiagnostic(this.peek().location, "AXL250", "Expected '>' to close generic type");
      }
      return { name, typeArgument, location: loc };
    }

    return { name, location: loc };
  }

  // -------------------------------------------------------------------------
  // Value scanners (URLs, paths, rate limits)
  // -------------------------------------------------------------------------

  /**
   * Scans a URL value by consuming tokens until a newline or EOF.
   * URLs are composed of identifiers, colons, slashes, dots, and numbers.
   */
  private scanUrlValue(): string {
    let url = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      url += this.peek().value;
      this.advance();
    }
    return url;
  }

  /**
   * Scans an endpoint path value: /projects/{id}/tasks
   * Consumes tokens until newline or EOF. Path segments include
   * slashes, identifiers, and {param} placeholders (curly braces
   * are embedded in identifiers by the lexer).
   */
  private scanPathValue(): string {
    let path = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      const t = this.peek();
      if (t.type === TokenType.Comment) break;
      path += t.value;
      this.advance();
    }
    return path;
  }

  /**
   * Scans a rate limit value like: 5/min, 100/hour
   */
  private scanRateLimitValue(): string {
    let value = "";
    while (!this.isAtEnd() && this.peek().type !== TokenType.Newline && this.peek().type !== TokenType.EOF) {
      const t = this.peek();
      if (t.type === TokenType.Comment) break;
      value += t.value;
      this.advance();
    }
    return value.trim();
  }

  // -------------------------------------------------------------------------
  // Token consumption helpers
  // -------------------------------------------------------------------------

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.peek().type === TokenType.EOF;
  }

  private peekKeyword(keyword: string): boolean {
    const t = this.peek();
    return t.type === TokenType.Keyword && t.value === keyword;
  }

  private expectKeyword(keyword: string): void {
    const t = this.peek();
    if (t.type === TokenType.Keyword && t.value === keyword) {
      this.advance();
      return;
    }
    this.addDiagnostic(t.location, "AXL260", `Expected '${keyword}', got '${t.value}'`);
    // Don't advance — let the caller handle recovery
  }

  private expectIdentifier(context: string): string {
    const t = this.peek();
    // Accept both Identifier and Keyword tokens as identifiers in value position.
    // This allows things like `FRAMEWORK Express` where the value is an identifier,
    // as well as `DATABASE PostgreSQL`.
    if (t.type === TokenType.Identifier || t.type === TokenType.Keyword) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL261", `Expected ${context} (identifier), got '${t.value}'`);
    // Return the value anyway to continue parsing
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "<missing>";
  }

  private expectString(context: string): string {
    const t = this.peek();
    if (t.type === TokenType.StringLiteral) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL262", `Expected ${context} (string), got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "";
  }

  private expectVersionOrNumber(context: string): string {
    const t = this.peek();
    if (t.type === TokenType.VersionLiteral || t.type === TokenType.NumberLiteral) {
      this.advance();
      return t.value;
    }
    this.addDiagnostic(t.location, "AXL263", `Expected ${context} (version or number), got '${t.value}'`);
    if (t.type !== TokenType.Newline && t.type !== TokenType.EOF) {
      this.advance();
      return t.value;
    }
    return "0.0.0";
  }

  private expectColon(): void {
    const t = this.peek();
    if (t.type === TokenType.Colon) {
      this.advance();
      return;
    }
    this.addDiagnostic(t.location, "AXL264", `Expected ':', got '${t.value}'`);
  }

  // -------------------------------------------------------------------------
  // Skip / recovery helpers
  // -------------------------------------------------------------------------

  private skipNewlines(): void {
    while (!this.isAtEnd() && this.peek().type === TokenType.Newline) {
      this.advance();
    }
  }

  private skipComments(): void {
    while (!this.isAtEnd() && this.peek().type === TokenType.Comment) {
      this.advance();
      this.skipNewlines();
    }
  }

  /** True if current token is a top-level keyword (not an inner keyword like DESC). */
  private isAtTopLevel(): boolean {
    const t = this.peek();
    return t.type === TokenType.Keyword && TOP_LEVEL_KEYWORDS.has(t.value);
  }

  /** Skip tokens until we hit a top-level keyword or EOF. */
  private skipToNextTopLevel(): void {
    while (!this.isAtEnd() && !this.isAtTopLevel()) {
      this.advance();
    }
  }

  // -------------------------------------------------------------------------
  // Diagnostic helpers
  // -------------------------------------------------------------------------

  private addDiagnostic(location: SourceLocation, code: string, message: string, suggestion?: string): void {
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code,
      message,
      location,
      suggestion,
    });
  }
}

// ---------------------------------------------------------------------------
// Parse result types
// ---------------------------------------------------------------------------

export type ParseResult =
  | { type: "app"; node: AppNode; diagnostics: Diagnostic[] }
  | { type: "schema"; nodes: EntityNode[]; diagnostics: Diagnostic[] }
  | { type: "actions"; nodes: ActionNode[]; diagnostics: Diagnostic[] }
  | { type: "workflows"; nodes: WorkflowNode[]; diagnostics: Diagnostic[] }
  | { type: "auth"; auth: AuthAST; diagnostics: Diagnostic[] }
  | { type: "empty"; diagnostics: Diagnostic[] };
