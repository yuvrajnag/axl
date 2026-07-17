import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxlEngine, PermissionError } from "../src/engine.js";
import { InMemoryStateStore } from "../src/state.js";
import crypto from "crypto";

const mockManifest = {
  app: { name: "TestApp", version: "1.0.0", base_url: "http://localhost:4000" },
  actions: {
    sensitive_action: {
      permission: "PUBLIC",
      confirm: "OTP",
      endpoint: { path: "/sensitive", method: "POST" },
      input: {}
    },
    rate_limited_action: {
      permission: "PUBLIC",
      endpoint: { path: "/rate_limited", method: "POST" },
      input: {}
    }
  },
  rateLimits: {
    rate_limited_action: "2/sec"
  }
};

describe("Concurrency and Race Conditions", () => {
  let engine: AxlEngine;
  let state: InMemoryStateStore;

  beforeEach(() => {
    state = new InMemoryStateStore();
    engine = new AxlEngine(mockManifest, state);
    
    // Mock the actual HTTP call to track executions
    engine._executeHttp = async (actionName) => {
      return { success: true, action: actionName };
    };
  });

  afterEach(() => {
    engine.destroy();
  });

  it("OTP Double Execution (Race Condition)", async () => {
    // 1. Initiate OTP
    const reqResult = await engine.execute("sensitive_action", {}, {});
    expect(reqResult.confirmationRequired).toBe(true);
    
    const token = reqResult.token;
    const otp = reqResult.otp_demo_only;

    // 2. Simulate two concurrent valid confirmations
    // Using Promise.all to fire them at the exact same time
    const [res1, res2] = await Promise.allSettled([
      engine.confirmAction(token, otp),
      engine.confirmAction(token, otp)
    ]);

    // In a safe system, the first should succeed and the second should fail (or vice versa).
    // They should NOT both succeed.
    const successes = [res1, res2].filter(r => r.status === "fulfilled");
    
    // This assertion will pass if the bug is fixed.
    expect(successes.length).toBe(1);
  });

  it("Rate Limit Bypass (Race Condition)", async () => {
    // Limit is 2/sec.
    // If we fire 5 concurrently, only 2 should succeed.
    
    const requests = Array.from({ length: 5 }).map(() => {
      return engine.execute("rate_limited_action", {}, {});
    });

    const results = await Promise.allSettled(requests);
    
    const successes = results.filter(r => r.status === "fulfilled");
    
    // This assertion will pass if the bug is fixed.
    expect(successes.length).toBe(2);
  });
});
