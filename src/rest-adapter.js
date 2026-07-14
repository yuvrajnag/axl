import { Router } from "express";
import { loadManifest } from "./manifest.js";
import { AxlEngine, PermissionError, BackendError } from "./engine.js";

/**
 * Builds an Express Router exposing plain HTTP/JSON endpoints for AXL actions,
 * workflows, and confirmations.
 *
 * Shape mirrors buildAxlServer() from axl-server.js:
 *   buildRestAdapter(manifestPath, { contextExtractor, engine, stateStore })
 *   => { router, engine, manifest }
 */
export function buildRestAdapter(manifestPath, { contextExtractor, engine, stateStore } = {}) {
  const manifest = loadManifest(manifestPath);
  const actualEngine = engine || new AxlEngine(manifest, stateStore);
  const router = Router();

  // Parse JSON bodies on all REST routes
  router.use((req, res, next) => {
    if (!req.body && req.headers["content-type"]?.includes("application/json")) {
      // Express may not have parsed yet if this router is mounted without express.json()
      // But serve.ts mounts express.json() before this router, so this is a safety net.
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => {
        try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
        next();
      });
    } else {
      next();
    }
  });

  /**
   * Extracts context from the current request using the contextExtractor
   * provided by serve.ts (same AsyncLocalStorage pattern as MCP).
   */
  function getContext() {
    if (contextExtractor) {
      return contextExtractor();
    }
    return {};
  }

  /**
   * Maps engine errors to appropriate HTTP status codes and JSON error bodies,
   * matching the same error semantics as the MCP path.
   */
  function sendError(res, err) {
    if (err instanceof PermissionError) {
      return res.status(403).json({ error: "PERMISSION_DENIED", message: err.message });
    }
    if (err instanceof BackendError) {
      return res.status(err.status || 502).json({ error: "BACKEND_ERROR", status: err.status, body: err.body });
    }
    if (err.message && err.message.startsWith("Unknown action:")) {
      return res.status(404).json({ error: "NOT_FOUND", message: err.message });
    }
    if (err.message && err.message.startsWith("Unknown workflow:")) {
      return res.status(404).json({ error: "NOT_FOUND", message: err.message });
    }
    if (err.message && err.message.includes("Rate limit exceeded")) {
      return res.status(429).json({ error: "RATE_LIMIT_EXCEEDED", message: err.message });
    }
    if (err.message && (err.message.includes("invalid inputs") || err.message.includes("Invalid initial arguments"))) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }

  // ---- POST /actions/:actionName ----
  router.post("/actions/:actionName", async (req, res) => {
    try {
      const context = getContext();
      const result = await actualEngine.execute(req.params.actionName, req.body || {}, context);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- POST /workflows/:workflowName ----
  router.post("/workflows/:workflowName", async (req, res) => {
    try {
      const context = getContext();
      const result = await actualEngine.runWorkflow(req.params.workflowName, req.body || {}, context);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- POST /confirm ----
  router.post("/confirm", async (req, res) => {
    try {
      const { token, otp } = req.body || {};
      if (!token || !otp) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "Both 'token' and 'otp' are required." });
      }
      const result = await actualEngine.confirmAction(token, otp);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return { router, engine: actualEngine, manifest };
}
