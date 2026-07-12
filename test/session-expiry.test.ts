import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));

async function runTest() {
  const PORT = 3943;
  // Make session timeout super short (2 seconds) for testing
  serve(APP_FLOW_DIR, { port: PORT, sessionTimeoutMs: 2000 });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
  const client = new Client({ name: "t1", version: "1" }, { capabilities: {} });
  
  await client.connect(transport);
  console.log("Client connected.");

  // Make a request immediately
  await client.callTool({ name: "list_projects", arguments: {} });
  console.log("Initial request succeeded.");

  console.log("Waiting 3 seconds for session sweep...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Should fail because the server closed it!
  try {
    await client.callTool({ name: "list_projects", arguments: {} });
    console.log("❌ Test failed: Request succeeded after session should have expired!");
    process.exit(1);
  } catch (err: any) {
    console.log("✅ Request failed after expiry (Session swept successfully)");
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
