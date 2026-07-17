import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxlEngine } from "../src/engine.js";
import { InMemoryStateStore } from "../src/state.js";

const mockManifest = {
  app: { name: "TestApp", version: "1.0.0", base_url: "http://localhost:4000" },
  actions: {
    public_action: {
      permission: "PUBLIC",
      endpoint: { path: "/data", method: "POST" },
      input: {}
    }
  }
};

describe("Idempotency Cache", () => {
  let engine: AxlEngine;
  let state: InMemoryStateStore;
  let executions = 0;

  beforeEach(() => {
    state = new InMemoryStateStore();
    engine = new AxlEngine(mockManifest, state);
    executions = 0;
    
    // Mock the actual HTTP call to track executions
    engine._executeHttp = async (actionName, actionDef, args, context) => {
      executions++;
      return { success: true, count: executions, ip: context?.ip || "unknown" };
    };
  });

  afterEach(() => {
    engine.destroy();
  });

  it("prevents cache poisoning across different unauthenticated IPs", async () => {
    // User A executes the action
    const resA = await engine.execute("public_action", {}, { idempotencyKey: "123", ip: "10.0.0.1" });
    expect(resA.count).toBe(1);
    
    // User B executes the action with the SAME idempotency key
    const resB = await engine.execute("public_action", {}, { idempotencyKey: "123", ip: "10.0.0.2" });
    
    // If the cache key is just 'anon', User B gets User A's cached result!
    // But they have different IPs, so they shouldn't share the same anon bucket.
    expect(executions).toBe(2);
    expect(resB.count).toBe(2);
  });
});
