import express from "express";
import path from "path";
import fs from "fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
// @ts-ignore
import { buildAxlServer } from "../../src/mcp-server.js";
import { c } from "./ui.js";

// Storage for per-request context (like session cookie)
export const requestContext = new AsyncLocalStorage<{ sessionCookie?: string, idempotencyKey?: string }>();

export async function serve(outDir: string, options: { port?: number }) {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(c.red + `Error: Could not find manifest.json at ${manifestPath}` + c.reset);
    console.error("Run `axl compile` first to generate the manifest.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const app = express();
  
  app.get("/health", (req, res) => {
    res.json({
      name: manifest.app.name,
      version: manifest.app.version,
      axl_version: manifest.axl_version
    });
  });

  app.get("/.well-known/mcp", (req, res) => {
    const authRequired = Object.values(manifest.actions || {}).some(
      (a: any) => a.permission === "AUTH"
    );

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost";
    const absoluteUrl = `${protocol}://${host}/mcp`;

    res.set("Content-Type", "application/json");
    res.set("X-Content-Type-Options", "nosniff");
    res.json({
      mcp_version: "1.0",
      server_name: manifest.app.name,
      server_version: manifest.app.version,
      endpoints: {
        streamable_http: absoluteUrl
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false
      },
      authentication: {
        required: authRequired,
        methods: ["api_key"]
      }
    });
  });

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Handle all MCP traffic through the Streamable HTTP transport
  app.all("/mcp", async (req, res, next) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId) {
      const existingTransport = sessions.get(sessionId);
      if (!existingTransport) {
        return res.status(404).json({ error: "Session not found" });
      }
      transport = existingTransport;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, transport);
        },
        onsessionclosed: (sid) => {
          sessions.delete(sid);
        }
      });
      const { server } = buildAxlServer(manifestPath, {
        contextExtractor: () => {
          const store = requestContext.getStore();
          return {
            sessionCookie: store?.sessionCookie,
            idempotencyKey: store?.idempotencyKey,
          };
        }
      });
      await server.connect(transport);
    }

    const authHeader = req.headers.authorization;
    let sessionCookie: string | undefined;
    
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      sessionCookie = authHeader.substring(7);
    } else if (req.headers["x-axl-session"]) {
      sessionCookie = req.headers["x-axl-session"] as string;
    }

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    // Run the request in the context of the extracted session
    requestContext.run({ sessionCookie, idempotencyKey }, () => {
      transport.handleRequest(req, res).catch((err) => {
        console.error("handleRequest error:", err);
        next(err);
      });
    });
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express error:", err);
    res.status(500).json({ error: err.message });
  });

  const port = options.port || 3939;
  
  app.listen(port, () => {
    console.log(`${c.brightCyan}${c.bold}AXL Server running${c.reset}`);
    console.log(`  ${c.dim}Health:${c.reset} http://localhost:${port}/health`);
    console.log(`  ${c.dim}MCP Endpoint:${c.reset} http://localhost:${port}/mcp`);
  });
}
