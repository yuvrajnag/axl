# AXL Agent Guide
AXL is an AI-native application specification language that compiles to an MCP (Model Context Protocol) server. AXL allows you to define workflows, entities, actions, and permissions declaratively.

## Project Structure
- `app.flow`: Top-level app definition (name, version, baseUrl, generators).
- `schema.flow`: Entity and relationship definitions.
- `actions.flow`: Action signatures and REST endpoint mappings.
- `workflows.flow`: Orchestrated sequences of actions with data binding.
- `auth.flow`: Security rules and confirm gates (OTP) for actions.

## CRITICAL: Case-Sensitivity
AXL keywords are strictly case-sensitive and **must be UPPERCASE**.
Keywords: `APP`, `ENTITY`, `ACTION`, `WORKFLOW`, `STEP`, `INPUT`, `OUTPUT`, `ENDPOINT`, `PERMISSION`, `CONFIRM`, `RATE_LIMIT`, `USING`, `IF`, `ELSE`, `END`.
If you use lowercase (e.g. `app`, `entity`), you will get compilation errors.

## Data Binding
Workflow steps MUST explicitly declare data dependencies using the `USING` clause. Missing required inputs will cause a compile error.
Syntax: `STEP <target_action> USING <target_input_field> = <source_step_name>.<source_output_field>`

Example:
```flow
WORKFLOW TaskLifecycle
  STEP create_task
  STEP update_task_status USING task_id = create_task.id
```

## Commands
1. `axl compile`: Compiles `flow/` into `build/manifest.json`. Run this often to get compiler errors immediately!
2. `axl generate`: Runs generators (like DIAGRAM) based on the manifest.
3. `axl doctor`: Diagnostic checks for the environment and project.

## Autonomous Mode
If the user says `/axl`, "start axl", or gives a brief app idea with no further detail, treat this as a request to build a working AXL backend end-to-end with minimal back-and-forth. Do not ask clarifying questions unless the request is genuinely ambiguous.

1. Run `axl init` if the project isn't already scaffolded. This creates PLACEHOLDER content (a generic `ENTITY User`, a `list_users` action, etc.) -- this is NOT your output and must be fully replaced.
2. Before writing anything, look at the existing project you're inside of: package.json, existing routes/controllers/models, README, any existing API code. If real project structure exists, base your schema/actions/workflows/auth on what's ACTUALLY there -- real entity names, real endpoints, real fields -- not invented ones. Only invent a plausible domain from scratch if the project is genuinely empty with nothing to infer from.
3. Write real schema.flow, actions.flow, workflows.flow, and auth.flow reflecting what you found (or invented), following the syntax rules above exactly (uppercase keywords, explicit USING bindings on every workflow step).
4. Run `axl compile`. If it fails, read the error output, fix the .flow files, and recompile -- repeat until it succeeds. A successful compile is NOT sufficient on its own -- the default placeholder template also compiles. Before proceeding, re-read your own schema.flow/actions.flow and confirm the names actually reflect the real project (or your invented domain), not leftover defaults.
5. Run `axl generate`. This produces MCP tool definitions, an OpenAPI spec, and Mermaid diagrams (DIAGRAM is enabled by default) in one step.
6. Do NOT attempt to run `axl serve` yourself -- it is a long-running process that never exits and will hang your own execution. Instead, report what was built and tell the user to run `axl serve` when they're ready to start the server.

If your environment has no terminal access, write the files and tell the user the exact commands to run themselves, in order: axl compile, axl generate, axl serve.
