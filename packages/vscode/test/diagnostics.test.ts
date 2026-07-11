// ============================================================================
// packages/vscode/test/diagnostics.test.ts — Unit tests for diagnostics
// ============================================================================

import { describe, it, expect } from "vitest";
import { getDiagnostics } from "../src/diagnostics.js";

describe("Diagnostics Provider", () => {
  it("should return diagnostics for duplicate entity names", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String\n\nENTITY Project\nname : String`,
    };

    const diags = getDiagnostics(sources);

    // Find the duplicate-entity diagnostic
    const dupDiag = diags.find(d => d.code === "AXL300");
    expect(dupDiag).toBeDefined();
    expect(dupDiag!.message).toContain("Project");
    expect(dupDiag!.location.line).toBeGreaterThan(0);
  });

  it("should return diagnostics for unknown type references", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String`,
      "actions.flow": `ACTION test_action\nDESC "Test"\nOUTPUT UnknownType\nENDPOINT GET /test`,
    };

    const diags = getDiagnostics(sources);

    // Should have a diagnostic about unknown type
    const typeDiag = diags.find(d =>
      d.message.toLowerCase().includes("unknown") ||
      d.code === "AXL310" ||
      d.code === "AXL311"
    );
    expect(typeDiag).toBeDefined();
  });

  it("should return no errors for valid sources", () => {
    const sources = {
      "app.flow": `APP TestApp\nVERSION 1.0.0\nDESCRIPTION "Test"`,
      "schema.flow": `ENTITY Project\nid : String\nname : String`,
      "actions.flow": `ACTION list_projects\nDESC "List"\nOUTPUT List<Project>\nENDPOINT GET /projects`,
      "workflows.flow": `WORKFLOW TestFlow\nSTEP list_projects`,
      "auth.flow": `PERMISSION list_projects : PUBLIC`,
    };

    const diags = getDiagnostics(sources);

    // Filter to errors only (warnings about optional files are OK)
    const errors = diags.filter(d => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});
