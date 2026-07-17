# AXL Protocol Specification

The AXL Protocol defines the standard by which AI clients (such as Thunderstrike) discover, authenticate, and communicate with an AXL-powered backend. 

AXL takes a "Serve Everything" architectural approach: it exposes an application's capabilities simultaneously over multiple transports (REST and MCP). The protocol dictates how clients should navigate this surface area securely and predictably.

---

## 1. Discovery (`/.well-known/axl`)

Discovery is the entry point for all AXL interactions. Clients must not rely on out-of-band configuration or browser-based scraping.

To discover capabilities, clients perform a `GET` request to `/.well-known/axl` on the host.

**Request:**
```http
GET /.well-known/axl HTTP/1.1
Host: api.example.com
```

**Response:**
```json
{
  "version": "1.0",
  "server_name": "TaskDeck",
  "server_version": "1.0.0",
  "manifest": "https://api.example.com/manifest.json",
  "rest": "https://api.example.com",
  "mcp": "https://api.example.com/mcp",
  "auth": {
    "type": "bearer",
    "note": "Obtain a session via the project's own login/register action, then send it as: Authorization: Bearer <token>"
  }
}
```

### Connection Sequence (Thunderstrike Standard)
All strictly-compliant AI clients (like Thunderstrike) must follow this connection sequence:
1. `GET /.well-known/axl`
2. `GET /manifest.json` (using the URL provided in step 1)
3. Attempt the **REST** transport.
4. If REST is unavailable or unresponsive, attempt the **MCP** transport.
5. If both transports are unavailable, emit a `Connection Failed` error to the user.

> [!WARNING]
> Under no circumstances should an AXL client fall back to browser automation, DOM inspection, Playwright, or Selenium. An application either exposes AXL or it doesn't.

---

## 2. Manifest Schema

The Manifest (`/manifest.json`) is a compiled representation of the application's domain logic, derived from `.flow` files. It acts as the definitive contract for all available entities, actions, and state machines.

The manifest is accessible via a standard HTTP GET, as specified in the `manifest` field of the discovery payload.

**Key Structure:**
- `app`: Metadata about the application (name, version).
- `entities`: Schemas for domain objects (fields, types, references).
- `actions`: Executable operations, including their `input` schema, `output` structure, and `permission` requirements.
- `workflows`: State machines defining multi-step orchestrations.

---

## 3. Transport Behavior

AXL always exposes its transports simultaneously. The engine is transport-agnostic, meaning the exact same business logic, validation, and permissions apply regardless of whether a client uses REST or MCP.

### REST Transport
- **Path**: Inherited from the `rest` URL in discovery (typically the root).
- **Format**: Standard JSON over HTTP.
- **Usage**: Standard frontend, mobile, and traditional API clients.
- **Endpoints**:
  - `POST /actions/:name`: Invoke a single action.
  - `POST /workflows/:name`: Start or progress a workflow.
  - `POST /confirm`: Confirm a pending OTP-gated action.

### MCP (Model Context Protocol) Transport
- **Path**: Inherited from the `mcp` URL in discovery (typically `/mcp`).
- **Format**: Streamable HTTP Server Transport (SSE + POST).
- **Usage**: Direct consumption by AI coding agents and LLMs.
- **Capabilities**: AXL currently exposes `tools` capability over MCP. Resources and Prompts are disabled by default.

---

## 4. Authentication Flow

AXL relies on bearer token authentication. The framework does not dictate *how* a token is minted (this is up to the developer's `.flow` actions, e.g., a `login` action), but it dictates how it must be provided.

1. **Minting**: The client calls an action with `permission: "PUBLIC"` (e.g., `login`). The backend returns a session token.
2. **Usage**: For all subsequent authenticated requests (where `permission: "AUTH"` or `permission: "OWNER"`), the client must provide the token:
   ```http
   Authorization: Bearer <token>
   ```
3. **Session Transport**: The Transport Manager transparently extracts this bearer token and handles passing it down to the engine's execution context.

---

## 5. Action Invocation

When a client invokes an action, it must pass a JSON payload matching the `input` schema defined in the manifest.

### Over REST:
```http
POST /actions/create_task
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Buy groceries",
  "status": "pending"
}
```

### Over MCP:
The action is exposed as an MCP Tool. The client calls `tools/call` with the tool name mapping directly to the AXL action name, and the arguments matching the input schema.

---

## 6. Error Responses

AXL provides standardized error responses across all transports.

**Standard Error Object:**
```json
{
  "error": "Short, human-readable error summary",
  "details": { ... } // Optional context (e.g., validation field failures)
}
```

**Common HTTP Status Codes (REST):**
- `400 Bad Request`: Input failed manifest schema validation.
- `401 Unauthorized`: Missing or invalid bearer token for an `AUTH` action.
- `403 Forbidden`: Authenticated, but lacks `OWNER` or role permissions.
- `404 Not Found`: Action or workflow does not exist in the manifest.
- `429 Too Many Requests`: Rate limit exceeded.

---

## 7. Future Extensibility: WebSockets

The AXL Transport Layer is designed to be pluggable. In a future major release, a WebSocket transport will be introduced for real-time bidirectional events (e.g., streaming workflow updates).

When introduced, the WebSocket transport will abide by the "Serve Everything" philosophy. It will be mounted automatically alongside REST and MCP without requiring any CLI flags, and its existence will be broadcasted in `/.well-known/axl`.

---

## 8. Versioning Strategy

The protocol version is denoted in `/.well-known/axl` as `version` (currently `1.0`).

- **Minor Updates**: Additive changes to the manifest schema or discovery payload. Clients should ignore unknown fields.
- **Major Updates**: Breaking changes to the transport sequence or core authentication requirements.

AXL guarantees backward compatibility for existing `.flow` specs; however, client implementers must respect the `version` field during discovery.
