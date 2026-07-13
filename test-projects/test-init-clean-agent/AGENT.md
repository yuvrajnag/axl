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
If the user says `/axl`, "start axl", or gives a brief app idea with no further detail, treat this as a request to scaffold and build a working AXL backend end-to-end with minimal back-and-forth. Do not ask clarifying questions unless the request is genuinely ambiguous about which domain to build.

1. If no app idea was given, pick a reasonable one yourself (e.g. a blog, a task tracker, a booking system) and proceed.
2. Write schema.flow, actions.flow, workflows.flow, and auth.flow for that domain, following the syntax rules above exactly (uppercase keywords, explicit USING bindings on every workflow step).
3. Run `axl compile`. If it fails, read the error output, fix the .flow files, and recompile -- repeat until it succeeds.
4. Run `axl generate`.
5. Report back what was built, and mention `axl doctor` and `axl serve` as the natural next commands.

If your environment has no terminal access, write the files and tell the user the exact commands to run themselves.
