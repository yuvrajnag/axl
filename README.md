# AXL

AXL is a declarative language for building serverless workflows, APIs, and business logic. It provides a compiler and an execution engine that enables robust, stateful execution of workflows with explicit data binding and compile-time verification.

## Features
- Declarative `.flow` syntax for entities, actions, and workflows.
- Strong static validation and rate-limiting enforcement.
- Integrated generation tools (diagrams, etc.).

## Setup

```bash
npm install
npm run build
```

## Runtime State & Scaling

AXL manages internal state for features like OTP confirmations, paused workflows, rate-limiting, and idempotency caching.

- **In-Memory (Default)**: Simplest and fastest. State is kept in process memory. **Warning:** If the AXL server restarts, all pending state is lost (e.g., users mid-way through an OTP flow will have to restart).
- **File-Backed (Opt-in)**: You can pass `--state-file .axl/state.json` (or set `stateFile` in `axl.config.json`) to persist state to disk. This survives a server restart. This is intended for single-instance development or very small deployments.
  - *Note: MCP HTTP transport sessions (`StreamableHTTPServerTransport`) are inherently tied to active TCP connections and will still drop on restart regardless of this setting.*
- **External Store (Not Supported)**: AXL currently does not support Redis or other external databases for internal state. **You cannot safely run multiple concurrent `axl serve` replicas sharing the same state file.** True multi-instance horizontal scaling is not yet supported.

## License
MIT
