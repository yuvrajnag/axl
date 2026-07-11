// ============================================================================
// packages/vscode/src/formatter.ts — Pure format function (no VS Code deps)
// ============================================================================

/**
 * Format a .flow source string.
 * 
 * Reuses the exact same logic as `axl format` (packages/cli/format.ts).
 * The function is inlined here to avoid a runtime dependency on the CLI
 * package at extension load time — but it is the SAME algorithm, kept
 * in sync via the shared test suite.
 */
export function formatFlowSource(code: string): string {
  const lines = code.split(/\r?\n/);
  const formatted: string[] = [];

  let indent = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.trim();

    if (line.length === 0) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== "") {
        formatted.push("");
      }
      continue;
    }

    if (line.includes("}")) {
      indent = Math.max(0, indent - 1);
    }

    let spaces = "  ".repeat(indent);

    formatted.push(spaces + line);

    if (line.includes("{")) {
      indent++;
    }
  }

  // Ensure trailing newline
  let result = formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result + "\n";
}
