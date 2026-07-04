// ============================================================================
// packages/cli/compile.ts — axl compile
// ============================================================================

import { Compiler, formatDiagnostics, DiagnosticSeverity } from "@axl/compiler";
import * as ui from "./ui.js";
import { c } from "./ui.js";

export function compile(flowDir: string, outDir: string): void {
  ui.banner("Compiling AXL", `${flowDir} ${ui.icons.arrow} ${outDir}`);
  ui.blank();

  const start = performance.now();
  const compiler = new Compiler(flowDir);

  // Step 1: Parse + Validate
  ui.step("Parsing", ".flow files");
  ui.step("Validating", "semantic checks");

  // Step 2: Compile
  const result = compiler.compile(outDir);
  const elapsed = (performance.now() - start).toFixed(0);

  if (result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    ui.blank();
    console.log(formatDiagnostics(result.diagnostics));

    if (errors.length > 0) {
      ui.blank();
      ui.errorBox(
        `Compilation failed`,
        [
          `${c.red}${errors.length}${c.reset} error(s), ${c.yellow}${warnings.length}${c.reset} warning(s)`,
        ],
        ["Fix the errors above and run again."],
      );
      process.exit(1);
    }

    if (warnings.length > 0) {
      ui.blank();
      ui.warn(`${warnings.length} warning(s)`);
    }
  }

  if (result.success) {
    ui.step("Building manifest", result.manifestPath ?? "");
    ui.blank();
    ui.success(`Compiled successfully in ${c.bold}${elapsed}ms${c.reset}`);
    ui.blank();
    ui.dim(`Output: ${result.manifestPath}`);
    ui.blank();
  }
}
