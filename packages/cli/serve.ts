import express from "express";
import path from "path";
import fs from "fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
// @ts-ignore
import { buildAxlServer } from "../../src/axl-server.js";
// @ts-ignore
import { buildRestAdapter } from "../../src/rest-adapter.js";
// @ts-ignore
import { FileStateStore } from "../../src/state.js";
import { c, icons, errorBlock, section, blank } from "./ui.js";

// Storage for per-request context (like session cookie)
export const requestContext = new AsyncLocalStorage<{ sessionCookie?: string, idempotencyKey?: string, ip?: string }>();

export async function serve(outDir: string, options: { port?: number, sessionTimeoutMs?: number, trustProxy?: boolean, stateFile?: string, rest?: boolean, both?: boolean }) {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    blank();
    errorBlock({
      title: "Manifest not found",
      message: `Could not find manifest.json at ${manifestPath}`,
      help: "Run axl compile first to generate the manifest."
    });
    throw new Error("Manifest not found");
  }

  let stateStore = undefined;
  if (options.stateFile) {
    const statePath = path.resolve(options.stateFile);
    stateStore = new FileStateStore(statePath);
  }

  const useMcp = !options.rest;   // MCP unless --rest only
  const useRest = options.rest || options.both;  // REST if --rest or --both

  const { engine, manifest } = buildAxlServer(manifestPath, { stateStore });

  const app = express();
  
  app.get("/health", (req, res) => {
    res.json({
      name: manifest.app.name,
      version: manifest.app.version,
      axl_version: manifest.axl_version
    });
  });

  // Shared context extraction: parses session cookie, idempotency key, and IP
  // from request headers. Used identically by both MCP and REST transports.
  function extractContext(req: express.Request) {
    const authHeader = req.headers.authorization;
    let sessionCookie: string | undefined;
    
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      // The backend expects a Cookie header in the format "key=value". 
      // If the client sends a raw bearer token, we wrap it using the "sid" convention.
      sessionCookie = token.includes("=") ? token : `sid=${token}`;
    } else if (req.headers["x-axl-session"]) {
      sessionCookie = req.headers["x-axl-session"] as string;
    }

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    let ip = req.socket.remoteAddress;
    if (options.trustProxy && req.headers["x-forwarded-for"]) {
      const forwardedFor = Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : req.headers["x-forwarded-for"];
      if (forwardedFor) {
        ip = forwardedFor.split(',')[0]?.trim() || ip;
      }
    }

    return { sessionCookie, idempotencyKey, ip };
  }

  // NOTE: This Map tracks active MCP HTTP transport sessions.
  // It is intentionally NOT backed by the StateStore. An SSE connection (which is what 
  // StreamableHTTPServerTransport manages) is inherently tied to the active process memory.
  // If the server restarts, those TCP/HTTP connections are physically dropped. 
  // Therefore, this session state remains process-local and will not survive a restart.
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport, lastActivity: number }>();

  if (useMcp) {
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

    // Handle all MCP traffic through the Streamable HTTP transport
    app.all("/mcp", async (req, res, next) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId) {
        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
          return res.status(404).json({ error: "Session not found" });
        }
        sessionData.lastActivity = Date.now();
        transport = sessionData.transport;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, lastActivity: Date.now() });
          },
          onsessionclosed: (sid) => {
            sessions.delete(sid);
          }
        });
        const { server } = buildAxlServer(manifestPath, {
          engine,
          contextExtractor: () => {
            const store = requestContext.getStore();
            return {
              sessionCookie: store?.sessionCookie,
              idempotencyKey: store?.idempotencyKey,
              ip: store?.ip
            };
          }
        });
        await server.connect(transport);
      }

      const ctx = extractContext(req);

      // Run the request in the context of the extracted session
      requestContext.run(ctx, () => {
        transport.handleRequest(req, res).catch((err) => {
          console.error("handleRequest error:", err);
          next(err);
        });
      });
    });
  }

  if (useRest) {
    const { router: restRouter } = buildRestAdapter(manifestPath, {
      engine,
      contextExtractor: () => {
        const store = requestContext.getStore();
        return {
          sessionCookie: store?.sessionCookie,
          idempotencyKey: store?.idempotencyKey,
          ip: store?.ip
        };
      }
    });

    // Wrap REST routes with context extraction middleware and JSON body parser
    app.use("/", express.json(), (req, res, next) => {
      const ctx = extractContext(req);
      requestContext.run(ctx, () => next());
    }, restRouter);
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express error:", err);
    const message = process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message;
    res.status(500).json({ error: message });
  });

  const port = options.port || 3939;
  const transportLabel = useRest && useMcp ? "MCP + REST" : useRest ? "REST" : "MCP";
  
  const httpServer = app.listen(port, () => {
    section("AXL Server");
    console.log(`  ${c.success(icons.success)} ${c.primary("Running")} (${transportLabel})`);
    blank();
    console.log(`  ${c.secondary("Health")}        ${c.accent(`http://localhost:${port}/health`)}`);
    if (useMcp) {
      console.log(`  ${c.secondary("MCP Endpoint")}  ${c.accent(`http://localhost:${port}/mcp`)}`);
    }
    if (useRest) {
      console.log(`  ${c.secondary("REST API")}      ${c.accent(`http://localhost:${port}/actions/:name`)}`);
    }
    blank();
  });

  const sessionTimeout = options.sessionTimeoutMs || 30 * 60 * 1000;
  const sweepIntervalMs = Math.min(60000, Math.max(1000, sessionTimeout / 2));
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, sessionData] of sessions.entries()) {
      if (now - sessionData.lastActivity > sessionTimeout) {
        sessionData.transport.close();
        sessions.delete(sid);
      }
    }
  }, sweepIntervalMs);

  const shutdown = () => {
    clearInterval(sweepInterval);
    console.log(`\n  ${c.warning(icons.warning)} ${c.plain("Shutting down AXL server...")}`);
    httpServer.close(() => {
      if (engine && typeof engine.destroy === 'function') {
        engine.destroy();
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
