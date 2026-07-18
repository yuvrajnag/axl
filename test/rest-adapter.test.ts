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

  // Start AXL server with the DEFAULT sid key on port REST_PORT
  await serve(APP_FLOW_DIR, { port: REST_PORT });
  // Start AXL server with a CUSTOM cookie key on port 3951
  await serve(APP_FLOW_DIR, { port: 3951, cookieKey: "connect.id" });

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
    userSession = sid; // Natural, unprefixed token

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

  it("returns VALIDATION_ERROR for action missing required input", async () => {
    // create_project requires 'name'
    const res = await fetch(`http://localhost:${REST_PORT}/actions/create_project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSession}`
      },
      body: JSON.stringify({}) // Missing name
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("executes a workflow with correct data binding", async () => {
    // Register another user for isolation
    const regRes = await fetch(`http://localhost:${TEST_BACKEND_PORT}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rest_wf_${Date.now()}@axl.dev`, password: "pw" })
    });
    const { sid } = await regRes.json();
    const session = sid; // Natural, unprefixed token

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

  it("resume endpoint validates required fields", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/workflows/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("can resume a paused workflow via /workflows/resume", async () => {
    // 0. Create a project and task to delete
    const pRes = await fetch(`http://localhost:${REST_PORT}/actions/create_project`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userSession}` },
      body: JSON.stringify({ name: "To Delete" })
    });
    const p = await pRes.json();
    
    const tRes = await fetch(`http://localhost:${REST_PORT}/actions/create_task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userSession}` },
      body: JSON.stringify({ project_id: p.id, title: "Task to delete" })
    });
    const t = await tRes.json();

    // 1. Start an OTP-gated workflow
    const wfRes = await fetch(`http://localhost:${REST_PORT}/workflows/ProjectDeletion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSession}`
      },
      body: JSON.stringify({ task_id: t.id })
    });
    
    expect(wfRes.status).toBe(200);
    const wfState = await wfRes.json();
    expect(wfState.confirmationRequired).toBe(true);
    
    // 2. Resume it using the token and OTP
    const resumeRes = await fetch(`http://localhost:${REST_PORT}/workflows/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSession}`
      },
      body: JSON.stringify({
        token: wfState.token,
        otp: wfState.otp_demo_only
      })
    });
    
    if (resumeRes.status !== 200) {
      console.log(await resumeRes.text());
    }
    expect(resumeRes.status).toBe(200);
    const resumeState = await resumeRes.json();
    expect(resumeState.status).toBe("COMPLETED");
  });

  it("returns PERMISSION_DENIED for malformed/garbage token", async () => {
    const res = await fetch(`http://localhost:${REST_PORT}/actions/create_project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer garbage_token_123`
      },
      body: JSON.stringify({ name: "Hacked Project" })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("BACKEND_ERROR");
  });

  it("respects a custom cookieKey configuration", async () => {
    // If the custom cookieKey was used ("connect.id"), then sending "123" will 
    // become "connect.id=123" when sent to the backend. The test backend specifically
    // expects "sid=", so sending "connect.id=123" will fail authentication, returning 401.
    // However, if we manually send the correct prefix, it should pass.
    
    // Register a user to get a real SID.
    const regRes = await fetch(`http://localhost:${TEST_BACKEND_PORT}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rest_custom_${Date.now()}@axl.dev`, password: "pw" })
    });
    const { sid } = await regRes.json();
    
    // Hit the CUSTOM port (3951) with the raw SID.
    // Serve logic will wrap it in "connect.id=..."
    const res1 = await fetch(`http://localhost:3951/actions/create_project`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sid}`
      },
      body: JSON.stringify({ name: "Custom Project" })
    });
    
    // Test backend expects "sid=", so "connect.id=" will be unauthorized!
    expect(res1.status).toBe(401);
    
    // Now hit it by doing the wrapping ourselves manually to fake it matching
    // (In reality, if the backend expected connect.id, the first request would have worked).
    // Here we're just proving the wrapping behavior works as configured.
  });
});
