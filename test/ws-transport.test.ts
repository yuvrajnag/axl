import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../build", import.meta.url));

describe("WebSocket Transport", () => {
  const PORT = 3999;
  let serverProcess: any;

  beforeAll(async () => {
    // Start the AXL Server
    serve(APP_FLOW_DIR, { port: PORT });
    
    // Give it a moment to start
    await new Promise(r => setTimeout(r, 1000));
  });

  it("should connect, receive events, and respond to ping", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      let pongReceived = false;
      let eventReceived = false;

      ws.on("open", () => {
        // Send a ping message
        ws.send(JSON.stringify({ type: "ping" }));
      });

      ws.on("message", async (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === "pong") {
          pongReceived = true;
          
          // Now inject an event via the POST /events endpoint
          const res = await fetch(`http://localhost:${PORT}/events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer test-session"
            },
            body: JSON.stringify({ type: "payment.completed", data: { id: 123 } })
          });
          expect(res.ok).toBe(true);
        }

        if (msg.type === "payment.completed" && msg.data?.id === 123) {
          eventReceived = true;
        }

        if (pongReceived && eventReceived) {
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
      
      // Safety timeout
      setTimeout(() => reject(new Error("Timeout waiting for ws messages")), 5000);
    });
  });
});
