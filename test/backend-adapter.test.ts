import { describe, it, expect, vi } from 'vitest';
import { executeHttpCall } from "../src/backend-adapter.js";

describe("URL Construction", () => {
  it("appends query string correctly when base URL ALREADY has a query", async () => {
    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    });
    global.fetch = fetchMock as any;

    await executeHttpCall(
      "http://api.com", 
      { endpoint: { path: "/users?v=1", method: "GET" } },
      { id: "1" },
      null
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    
    // Will fail if it produces http://api.com/users?v=1?id=1
    expect(calledUrl).toBe("http://api.com/users?v=1&id=1");
  });
});
