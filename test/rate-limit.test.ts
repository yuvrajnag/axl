import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));

async function runTest() {
  const PORT = 3942;
  // Trust proxy so we can mock x-forwarded-for
  serve(APP_FLOW_DIR, { port: PORT, trustProxy: true });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Create 2 independent clients simulating different IPs via X-Forwarded-For
  const t1 = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`), {
    requestInit: { headers: { "X-Forwarded-For": "10.0.0.1" } }
  });
  const t2 = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`), {
    requestInit: { headers: { "X-Forwarded-For": "10.0.0.2" } }
  });
  
  const c1 = new Client({ name: "t1", version: "1" }, { capabilities: {} });
  const c2 = new Client({ name: "t2", version: "1" }, { capabilities: {} });
  
  await c1.connect(t1);
  await c2.connect(t2);

  console.log("Clients connected.");

  // Flood c1 to hit rate limit (10 req/min)
  let c1Fails = 0;
  for (let i = 0; i < 20; i++) {
    const res = await c1.callTool({ name: "list_tasks", arguments: { project_id: "p1" } });
    const text = (res.content as any)[0].text;
    if (res.isError && text.includes("Rate limit exceeded")) {
      c1Fails++;
      console.log(`c1 hit limit on request ${i}`);
      break;
    }
  }

  // Now verify c2 can still make a request without being rate-limited!
  let c2Success = false;
  const res2 = await c2.callTool({ name: "list_tasks", arguments: { project_id: "p1" } });
  const text2 = (res2.content as any)[0].text;
  if (!res2.isError || !text2.includes("Rate limit exceeded")) {
    c2Success = true;
    console.log("c2 succeeded! (Isolation working)");
  } else {
    console.error("c2 failed with rate limit! Isolation NOT working.", res2);
  }

  if (c1Fails > 0 && c2Success) {
    console.log("✅ Rate limit isolated by IP successfully!");
    process.exit(0);
  } else {
    console.log("❌ Test failed.");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
