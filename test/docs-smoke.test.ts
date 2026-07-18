import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { serve } from "../packages/cli/serve.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "../smoke-test-dir");
const PORT = 3939;

describe("Docs Smoke Test", () => {
  let serverProcess: any;

  beforeAll(async () => {
    // Cleanup if exists
    if (fs.existsSync(SMOKE_DIR)) {
      fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SMOKE_DIR);

    // 1. axl init
    execSync("npx tsx ../packages/cli/index.ts init -y", { cwd: SMOKE_DIR, stdio: "ignore" });

    // 2. axl compile
    execSync("npx tsx ../packages/cli/index.ts compile", { cwd: SMOKE_DIR, stdio: "ignore" });

    // 4. axl serve
    const { spawn } = await import("node:child_process");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    serverProcess = spawn(npx, ["tsx", "../packages/cli/index.ts", "serve", "--port", PORT.toString()], {
      cwd: SMOKE_DIR,
      stdio: "ignore",
      shell: process.platform === "win32"
    });

    await new Promise(r => setTimeout(r, 2000));
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
    if (fs.existsSync(SMOKE_DIR)) {
      try {
        fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore EBUSY on Windows
      }
    }
  });

  it("successfully responds to /health on default port 3939", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeDefined();
    expect(body.version).toBeDefined();
  });
});
