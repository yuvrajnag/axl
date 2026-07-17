import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from "../packages/cli/serve.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));

const PORT_BOTH = 3962;

beforeAll(async () => {
  // Ensure the manifest is compiled
  execSync("npx tsx packages/cli/index.ts compile", { stdio: "ignore" });

  // Start the server (always exposes both REST and MCP)
  await serve(APP_FLOW_DIR, { port: PORT_BOTH });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Discovery and Manifest Endpoints", () => {
  describe("Both transports active (default behavior)", () => {
    it("GET /.well-known/axl reports both rest and mcp as active", async () => {
      const res = await fetch(`http://localhost:${PORT_BOTH}/.well-known/axl`);
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.version).toBe("1.0");
      expect(body.rest).toBe(`http://localhost:${PORT_BOTH}`);
      expect(body.mcp).toBe(`http://localhost:${PORT_BOTH}/mcp`);
      expect(body.manifest).toBe(`http://localhost:${PORT_BOTH}/manifest.json`);
    });
  });

  describe("Manifest endpoint", () => {
    it("GET /manifest.json returns compiled manifest with Cache-Control", async () => {
      const res = await fetch(`http://localhost:${PORT_BOTH}/manifest.json`);
      expect(res.status).toBe(200);
      
      // Check headers
      expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
      // Express ETag is enabled by default for res.json()
      expect(res.headers.get("etag")).toBeDefined();
      expect(res.headers.get("etag")?.length).toBeGreaterThan(0);
      
      // Check content
      const body = await res.json();
      expect(body.app).toBeDefined();
      expect(body.app.name).toBe("TaskDeck"); // Default from example or compilation
      expect(body.actions).toBeDefined();
    });

    it("GET /manifest.json is accessible without authentication", async () => {
      // Explicitly no auth header
      const res = await fetch(`http://localhost:${PORT_BOTH}/manifest.json`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.app).toBeDefined();
    });
  });
});
