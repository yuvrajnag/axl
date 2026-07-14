import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from "../packages/cli/serve.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));
const TEST_BACKEND_PORT = 4000;
const REST_PORT = 3950;

// We need the test backend running for real HTTP calls.
// The test-backend/server.js auto-starts on port 4000.
let testBackendProcess: any;

beforeAll(async () => {
  // Ensure the manifest is compiled before running tests
  execSync("npx tsx packages/cli/index.ts compile", { stdio: "ignore" });

  // Start the test backend
  const { server } = await import("../test-backend/server.js");
  testBackendProcess = server;

  // Start AXL server in REST-only mode
  await serve(APP_FLOW_DIR, { port: REST_PORT, rest: true });

  // Wait for servers to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("REST Adapter", () => {
  let userSession: string;

  it("returns PERMISSION_DENIED for AUTH action without session", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/actions/list_projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("PERMISSION_DENIED");
  });

  it("executes a successful action call with session", async () => {
    // Register a user on the test backend first
    const regRes = await fetch(`http://localhost:${TEST_BACKEND_PORT}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rest_test_${Date.now()}@axl.dev`, password: "pw" })
    });
    const { sid } = await regRes.json();
    userSession = `sid=${sid}`;

    // Now call create_project via REST adapter with session
    const res = await fetch(`http://localhost:${REST_PORT}/actions/create_project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSession}`
      },
      body: JSON.stringify({ name: "REST Test Project" })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("REST Test Project");
    expect(body.id).toBeDefined();
  });

  it("executes a workflow with correct data binding", async () => {
    // Register another user for isolation
    const regRes = await fetch(`http://localhost:${TEST_BACKEND_PORT}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rest_wf_${Date.now()}@axl.dev`, password: "pw" })
    });
    const { sid } = await regRes.json();
    const session = `sid=${sid}`;

    // First create a project (needed for TaskLifecycle workflow)
    const projectRes = await fetch(`http://localhost:${REST_PORT}/actions/create_project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session}`
      },
      body: JSON.stringify({ name: "WF Project" })
    });
    const project = await projectRes.json();

    // Run TaskLifecycle workflow: create_task -> update_task_status (with binding)
    const wfRes = await fetch(`http://localhost:${REST_PORT}/workflows/TaskLifecycle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session}`
      },
      body: JSON.stringify({
        project_id: project.id,
        title: "REST WF Task",
        status: "in_progress"
      })
    });

    expect(wfRes.status).toBe(200);
    const wfBody = await wfRes.json();
    expect(wfBody.status).toBe("COMPLETED");
    expect(wfBody.finalResult).toBeDefined();
    // The update_task_status step should have received task_id from create_task
    expect(wfBody.finalResult.update_task_status).toBeDefined();
    expect(wfBody.finalResult.update_task_status.status).toBe("in_progress");
  });

  it("returns NOT_FOUND for unknown action", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/actions/nonexistent_action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for unknown workflow", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/workflows/nonexistent_workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("confirm endpoint validates required fields", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});
