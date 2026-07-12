import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildAxlServer } from "../src/axl-server.js";
import { fileURLToPath } from "url";

const APP_FLOW = fileURLToPath(new URL("../build/manifest.json", import.meta.url));

function extractJson(result) {
  return JSON.parse(result.content[0].text);
}

async function main() {
  console.log("=== 1. Register a real user against the test backend ===");
  const registerRes = await fetch("http://localhost:4000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `founder_${Date.now()}@axl.dev`, password: "pw123" }),
  });
  const { sid } = await registerRes.json();
  const sessionCookie = `sid=${sid}`;
  console.log("Registered, session:", sessionCookie);

  console.log("\n=== 2. Build AXL server from the manifest, with this user's session ===");
  const { server } = buildAxlServer(APP_FLOW, { sessionCookie });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  console.log("MCP client connected to AXL server.");

  console.log("\n=== 3. List tools -- proves the manifest was correctly converted to MCP tool defs ===");
  const { tools } = await client.listTools();
  console.log(tools.map(t => t.name).join(", "));

  console.log("\n=== 4. Call create_project (PUBLIC? no -- AUTH) with a valid session ===");
  const createProjectRes = await client.callTool({
    name: "create_project",
    arguments: { name: "Launch AXL" },
  });
  const project = extractJson(createProjectRes);
  console.log(project);

  console.log("\n=== 5. Call create_task in that project ===");
  const createTaskRes = await client.callTool({
    name: "create_task",
    arguments: { project_id: project.id, title: "Finish manifest parser", due_date: "2026-07-10" },
  });
  const task = extractJson(createTaskRes);
  console.log(task);

  console.log("\n=== 6. Attempt delete_task -- this is OTP-gated, should NOT execute immediately ===");
  const deleteAttempt = await client.callTool({
    name: "delete_task",
    arguments: { task_id: task.id },
  });
  const pending = extractJson(deleteAttempt);
  console.log(pending);
  if (!pending.confirmationRequired) {
    throw new Error("FAIL: delete_task executed without confirmation!");
  }
  console.log("PASS: delete_task correctly blocked pending confirmation.");

  console.log("\n=== 7. Try to confirm with a WRONG otp -- must fail WITHOUT destroying the token ===");
  const wrongConfirm = await client.callTool({
    name: "confirm_action",
    arguments: { token: pending.token, otp: "000000" },
  });
  const wrongResult = extractJson(wrongConfirm);
  console.log(wrongResult);
  if (!wrongResult.error) {
    throw new Error("FAIL: wrong OTP was accepted!");
  }

  console.log("\n=== 8. Confirm with the correct OTP, using the SAME token -- must now succeed ===");
  const rightConfirm = await client.callTool({
    name: "confirm_action",
    arguments: { token: pending.token, otp: pending.otp_demo_only },
  });
  const deleteResult = extractJson(rightConfirm);
  console.log(deleteResult);
  if (deleteResult && deleteResult.error) {
    throw new Error(`FAIL: correct OTP after a prior wrong attempt was rejected: ${deleteResult.message}`);
  }
  console.log("PASS: wrong attempt did not destroy a valid pending confirmation.");

  console.log("\n=== 9. Verify the task is ACTUALLY gone from the real backend ===");
  const listRes = await client.callTool({
    name: "list_tasks",
    arguments: { project_id: project.id },
  });
  const remainingTasks = extractJson(listRes);
  console.log(remainingTasks);
  if (remainingTasks.some(t => t.id === task.id)) {
    throw new Error("FAIL: task still exists after confirmed deletion!");
  }
  console.log("PASS: task was actually deleted from the backend, not just reported as deleted.");

  console.log("\n=== 10. Security check: call create_project with NO session at all ===");
  const { server: anonServer } = buildAxlServer(APP_FLOW, { sessionCookie: null });
  const [anonClientT, anonServerT] = InMemoryTransport.createLinkedPair();
  const anonClient = new Client({ name: "anon-client", version: "1.0" });
  await Promise.all([anonClient.connect(anonClientT), anonServer.connect(anonServerT)]);
  const anonAttempt = await anonClient.callTool({
    name: "create_project",
    arguments: { name: "Should not be allowed" },
  });
  const anonResult = extractJson(anonAttempt);
  console.log(anonResult);
  if (anonResult.error !== "PERMISSION_DENIED") {
    throw new Error("FAIL: unauthenticated request was not blocked!");
  }
  console.log("PASS: unauthenticated AUTH-gated action correctly denied.");

  console.log("\n✅ ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
