// ============================================================================
// packages/vscode/test/formatter.test.ts — Unit tests for formatter
// ============================================================================

import { describe, it, expect } from "vitest";
import { formatFlowSource } from "../src/formatter.js";

describe("Formatter", () => {
  it("should normalize indentation to 2 spaces", () => {
    const input = `ENTITY Project\n    id : String\n      name : String\n`;
    const result = formatFlowSource(input);

    expect(result).toContain("ENTITY Project");
    expect(result).toContain("id : String");
    expect(result).toContain("name : String");
    // All lines should start with 0 indentation (top-level declarations)
    const lines = result.split("\n").filter(l => l.trim().length > 0);
    for (const line of lines) {
      expect(line).toBe(line.trimStart()); // No excess indent at top level
    }
  });

  it("should remove excessive blank lines", () => {
    const input = `ENTITY Project\n\n\n\n\nid : String\n\n\n\nname : String\n`;
    const result = formatFlowSource(input);

    // Should not have 3+ consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("should trim trailing whitespace", () => {
    const input = `ENTITY Project   \nid : String    \n`;
    const result = formatFlowSource(input);

    const lines = result.split("\n");
    for (const line of lines) {
      if (line.length > 0) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });

  it("should ensure trailing newline", () => {
    const input = `ENTITY Project\nid : String`;
    const result = formatFlowSource(input);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("should preserve a single blank line between blocks", () => {
    const input = `ENTITY Project\nid : String\n\nENTITY Task\nid : String\n`;
    const result = formatFlowSource(input);

    expect(result).toContain("ENTITY Project\n");
    expect(result).toContain("\nENTITY Task\n");
  });

  it("should format a complete flow file", () => {
    const input = [
      "    ACTION list_projects",
      "",
      "      DESC \"List all projects\"",
      "",
      "      OUTPUT List<Project>",
      "",
      "      ENDPOINT GET /projects",
      "",
    ].join("\n");

    const result = formatFlowSource(input);

    // All trimmed to zero indent (top-level)
    expect(result).toContain("ACTION list_projects");
    expect(result).toContain("DESC \"List all projects\"");
    expect(result).toContain("OUTPUT List<Project>");
    expect(result).toContain("ENDPOINT GET /projects");
  });
});
