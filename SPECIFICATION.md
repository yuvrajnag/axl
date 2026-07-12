# AXL Language Specification v1

AXL (AI-native eXecution Language) is a declarative specification language designed to describe backend applications, entities, actions, workflows, and security rules in a way that is easily understood by both humans and AI agents.

## 1. Philosophy

* **Declarative**: Focus on *what* the application does, not *how* it does it.
* **Minimalist**: Avoid programming language constructs (no braces, semicolons, or complex expressions).
* **AI-Native**: Structured to be easily generated and parsed by Large Language Models.
* **Strict**: The compiler enforces referential integrity across the entire project before execution.

## 2. File Structure

An AXL project consists of up to 5 `.flow` files in a single directory:

1. `app.flow` (Required): Core application metadata.
2. `schema.flow` (Optional): Data entity definitions.
3. `actions.flow` (Optional): API endpoints and executable actions.
4. `workflows.flow` (Optional): Orchestration of multiple actions.
5. `auth.flow` (Optional): Security, permissions, and rate limiting rules.

## 3. Lexical Grammar

* **Identifiers**: `[a-zA-Z_][a-zA-Z0-9_]*`
* **Strings**: Double-quoted `"...""` with standard escape sequences (`\n`, `\t`, `\"`, `\\`).
* **Numbers**: Integers (`42`) and floats (`3.14`).
* **Versions**: Semantic version strings (`1.0.0`).
* **Comments**: Started by `--` and continue to the end of the line.
* **Whitespace**: Used as token separators. Indentation is aesthetic but recommended.

### Reserved Keywords

`APP`, `NAME`, `VERSION`, `DESCRIPTION`, `FRAMEWORK`, `LANGUAGE`, `DATABASE`, `BASE_URL`, `ENTITY`, `ACTION`, `DESC`, `INPUT`, `OUTPUT`, `ENDPOINT`, `WORKFLOW`, `STEP`, `END`, `PERMISSION`, `CONFIRM`, `RATE_LIMIT`, `REQUIRED`, `OPTIONAL`, `PUBLIC`, `AUTH`, `OTP`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `GENERATORS`.

### Built-in Types

* `String`, `Number`, `Float`, `Boolean`, `Null`
* `List<T>` (Generic list)

## 4. Syntax and Semantics

### 4.1. `app.flow`

An AXL project starts with the `app.flow` file. It describes the global application configuration, tech stack, and generator outputs.

```flow
APP bananazon
NAME "Bananazon"
VERSION 1.0.0
DESCRIPTION "Modern ecommerce platform"
FRAMEWORK SpringBoot
LANGUAGE Java
DATABASE PostgreSQL
BASE_URL https://api.bananazon.com

GENERATORS
  DIAGRAM
```

### Generators (AI Outputs)

AXL uses the `GENERATORS` block to define which AI-ready artifacts the compiler should produce. These are strictly used by `axl generate` and do not affect the runtime.

The following generator IDs are reserved:
- `DIAGRAM`: A visual workflow diagram representation.
- `AGENT`: AI agent manifests/scaffolding.
- `DOCS`: Semantic documentation for AI retrieval.
- `SDK_TS`: TypeScript SDK.
- `SDK_JAVA`: Java SDK.
- `SDK_PYTHON`: Python SDK.

### 4.2. `schema.flow`

Defines data models.

```flow
ENTITY <identifier>
  <identifier> : <type>
  <identifier> : <type>
```

### 4.3. `actions.flow`

Defines executable capabilities mapped to HTTP endpoints.

```flow
ACTION <identifier>
  DESC <string>
  INPUT
    <identifier> : <type> [REQUIRED | OPTIONAL]
  OUTPUT <type>
  ENDPOINT <HTTP_METHOD> <path>
```

### 4.4. `workflows.flow`

Defines ordered sequences of actions.

```flow
WORKFLOW <identifier>
  STEP <action_identifier>
  STEP <action_identifier>
END
```

### 4.5. `auth.flow`

Defines security policies for actions.

```flow
PERMISSION <action_identifier> : PUBLIC | AUTH
CONFIRM <action_identifier> : OTP
RATE_LIMIT <action_identifier> : <limit>
```

## 5. Validation Rules

The compiler enforces strict referential integrity:

* **Uniqueness**: Entities, actions, workflows, and fields within an entity must have unique names.
* **References**: Types used in fields/inputs/outputs must be primitives, `List<T>`, or defined entities.
* **Integrity**: `STEP`, `PERMISSION`, `CONFIRM`, and `RATE_LIMIT` must reference defined actions.
* **Completeness**: Every action must have an `OUTPUT`, an `ENDPOINT`, and a `PERMISSION` defined.
* **Cycles**: Circular references between entities are prohibited.

## 6. Compiler Architecture

The AXL Compiler is fully typed and implemented in TypeScript. It operates in distinct phases:

1. **Lexer**: Character-by-character tokenization (`packages/compiler/lexer.ts`).
2. **Parser**: Recursive-descent AST generation (`packages/compiler/parser.ts`).
3. **Validator**: Semantic cross-AST checks (`packages/compiler/validator.ts`).
4. **Manifest Generator**: JSON generation for the runtime (`packages/compiler/manifest.ts`).

### Output

The compiler produces a single `manifest.json` file. The AXL runtime (engine and MCP server) consumes *only* this JSON file, entirely decoupling execution from parsing.
