import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from "../packages/cli/serve.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));

const PORT_REST = 3960;
const PORT_MCP = 3961;
const PORT_BOTH = 3962;

beforeAll(async () => {
  // Ensure the manifest is compiled
  execSync("npx tsx packages/cli/index.ts compile", { stdio: "ignore" });

  // Start servers in different modes
  await serve(APP_FLOW_DIR, { port: PORT_REST, rest: true });
  await serve(APP_FLOW_DIR, { port: PORT_MCP }); // default is MCP only
  await serve(APP_FLOW_DIR, { port: PORT_BOTH, both: true });

  // Wait for servers to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Discovery and Manifest Endpoints", () => {
  describe("REST only mode", () => {
    it("GET /.well-known/axl reports rest as active and mcp as null", async () => {
      const res = await fetch(`http://localhost:${PORT_REST}/.well-known/axl`);
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.version).toBe("1.0");
      expect(body.rest).toBe(`http://localhost:${PORT_REST}`);
      expect(body.mcp).toBeNull();
      expect(body.manifest).toBe(`http://localhost:${PORT_REST}/manifest.json`);
    });
  });

  describe("MCP only mode (default)", () => {
    it("GET /.well-known/axl reports mcp as active and rest as null", async () => {
      const res = await fetch(`http://localhost:${PORT_MCP}/.well-known/axl`);
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.version).toBe("1.0");
      expect(body.mcp).toBe(`http://localhost:${PORT_MCP}/mcp`);
      expect(body.rest).toBeNull();
      expect(body.manifest).toBe(`http://localhost:${PORT_MCP}/manifest.json`);
    });
  });

  describe("Both modes active", () => {
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
      const res = await fetch(`http://localhost:${PORT_REST}/manifest.json`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.app).toBeDefined();
    });
  });
});
