# Quick Start

Go from zero to a fully functional AXL server with REST APIs, MCP tools, authentication, and stateful workflows in **under 5 minutes**.

---

### Step 1: Install the CLI
Install the AXL CLI globally using npm (requires Node.js v18+).

```bash
npm install -g scl-axl
```

### Step 2: Initialize a Project
Create a new directory and scaffold the base project structure. This will generate your `axl.config.json` and a sample `flow/` directory.

```bash
mkdir my-first-axl && cd my-first-axl
axl init -y
```

### Step 3: Compile the Flow Files
AXL is a compiled language. The compiler validates your `.flow` files, catches syntax and type errors, and generates the `manifest.json` engine map.

```bash
axl compile
```
*You should see a success message indicating the compilation took mere milliseconds.*

### Step 4: Serve the Engine
Start the execution engine. AXL will automatically boot both the REST API and the Model Context Protocol (MCP) endpoints simultaneously.

```bash
axl serve
```

You should see output similar to this:
```
  AXL Server
  [OK] Running (MCP + REST)

  Health        http://localhost:3939/health
  MCP Endpoint  http://localhost:3939/mcp
  REST API      http://localhost:3939/actions/:name
```

---

## Taking it for a spin

### 1. Make your first REST Call
Open a new terminal window and hit the dynamically generated REST API endpoint. Assuming the scaffolded project includes a `list_projects` action:

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

### 2. Connect an AI Agent (MCP)
If you use Claude Desktop or Cursor, you can instantly give them access to all your backend logic! 

Add the following to your `mcp.json` or Cursor settings:
```json
{
  "mcpServers": {
    "my-axl-server": {
      "command": "npx",
      "args": ["axl", "serve", "--dir", "/path/to/my-first-axl/flow"]
    }
  }
}
```
Now, ask Claude: *"List my projects."* It will securely invoke the AXL endpoint on your behalf.

---

### Next Steps

- Explore the [Hotel Booking Example](../examples/hotel-booking) to see a real-world complex implementation.
- Read the [Architecture Overview](../README.md#architecture) to understand the AXL Engine.
