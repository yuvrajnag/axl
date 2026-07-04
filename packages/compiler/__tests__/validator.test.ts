import { describe, it, expect } from "vitest";
import { Compiler } from "../compiler.js";

describe("Validator", () => {
  it("detects unknown type references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": "ENTITY User \n field : UnknownType",
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toMatch(/Unknown type "UnknownType"/);
  });

  it("suggests similar names for unknown references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": "ENTITY Product \n id : String",
      "actions.flow": "ACTION get \n OUTPUT Prodct \n ENDPOINT GET /",
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.suggestion).toBe('Did you mean "Product"?');
  });

  it("detects circular entity references", () => {
    const sources = {
      "app.flow": "APP Test",
      "schema.flow": `
ENTITY A
  b : B
ENTITY B
  a : A
`,
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.message).toMatch(/Circular entity reference detected/);
  });
  
  it("detects missing permissions", () => {
    const sources = {
      "app.flow": "APP Test",
      "actions.flow": "ACTION get \n OUTPUT String \n ENDPOINT GET /get",
      "auth.flow": "PERMISSION other : PUBLIC", // Missing PERMISSION get
    };
    const result = Compiler.compileFromSources(sources);
    
    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.message.match(/no PERMISSION entry/))).toBe(true);
  });
});
