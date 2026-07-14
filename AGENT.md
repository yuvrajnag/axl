# AGENT.md

## Information for AI Coding Agents

This file is a reference for AI coding agents (like Claude, Cursor, or Aider) working in or alongside this repository. AXL is a declarative, compile-to-engine framework for backend APIs and workflows.

### 🧠 Project Philosophy
1. **No Runtime Architectural Changes**: The core AXL Engine (`src/engine.js`) and Server (`src/axl-server.js`) are frozen. Do NOT refactor, rename, split, or redesign the execution environment unless specifically instructed for a critical bug fix.
2. **Backward Compatibility is King**: Existing flows must continue to compile and run. Any new features must be purely additive.
3. **Stability over Cleverness**: AXL is designed for production resilience. Keep code simple, predictable, and robust.

### 🏗 Architecture Overview
AXL separates business logic from execution:
1. **Compiler**: Takes declarative `.flow` files (Entities, Actions, Workflows) and compiles them into a single `manifest.json`.
2. **Manifest**: The source of truth for runtime execution, containing all validation schemas, state machine graphs, and routing rules.
3. **Engine**: (`src/engine.js`) The runtime execution brain. It reads the manifest, enforces permissions, handles state, checks rate limits, and delegates backend calls.
4. **Adapters**: The Engine surfaces its capabilities via two parallel transports:
   - **MCP Adapter**: For AI agents to consume tools seamlessly.
   - **REST Adapter**: For standard frontend/mobile clients.

### 💡 Best Practices for Generating AXL Projects
When helping a user build an AXL project:
- Always use `axl init` to scaffold new projects.
- Write logic in `.flow` files inside the `flow/` directory.
- Define explicit `bind` blocks to pass data between workflow steps.
- Set `public` to `true` only for intentionally unauthenticated endpoints (like login/register). All other endpoints should be `public: false` (which is the default).
- For sensitive actions (like `transfer_funds`), always use `confirm: true` to enable the Two-Phase OTP gate.

### ⚙️ Configuration (axl.config.json)
The `axl.config.json` file controls CLI paths and server execution settings. When working with authentication, if the real backend expects a specific cookie key (like `JSESSIONID` or `connect.sid` instead of the default `sid`), specify it in `axl.config.json`:
\`\`\`json
{
  "auth": {
    "cookieKey": "connect.sid"
  }
}
\`\`\`

### 🤝 Contribution Guidelines
If you are asked to fix a bug in the AXL compiler or engine itself:
- Ensure all 79+ vitest tests pass (`npx vitest run`).
- Do not bypass existing permission or rate-limiting checks.
- If editing the CLI (`packages/cli/`), ensure standard standard output formats and help text are preserved.
