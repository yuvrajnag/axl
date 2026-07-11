// ============================================================================
// packages/cli/compile.ts — axl compile
// ============================================================================

import { Compiler, formatDiagnostics, DiagnosticSeverity } from "@axl/compiler";
import { c, icons, section, stepList, blank, errorBlock, env } from "./ui.js";
import path from "node:path";
import fs from "node:fs";

export async function compile(flowDir: string, outDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Compiling flow → manifest");
  }

  const start = performance.now();
  const compiler = new Compiler(flowDir);

  const stepsArr = [
    "Reading flow files",
    "Parsing specifications",
    "Semantic analysis",
    "Optimizing manifest",
    "Writing output"
  ];
  const steps = stepList(stepsArr, env.isQuiet);

  let idx = 0;
  steps.update(idx, "active");
  
  // Since compiler.compile() is synchronous and monolithic in the current API,
  // we just execute it and immediately advance the steps to reflect reality (instant execution).
  const result = compiler.compile(outDir);

  // Read actual file count if possible for metadata
  let fileCount = 0;
  if (fs.existsSync(flowDir)) {
    fileCount = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow")).length;
  }

  steps.update(idx++, "done", fileCount > 0 ? `${fileCount} files` : undefined);
  steps.update(idx, "active");
  steps.update(idx++, "done");
  steps.update(idx, "active");
  steps.update(idx++, "done");
  steps.update(idx, "active");
  steps.update(idx++, "done");
  steps.update(idx, "active");

  const elapsed = (performance.now() - start).toFixed(0);

  if (result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    if (errors.length > 0) {
      steps.update(idx++, "fail");
      steps.stop();
      blank();
      
      // Use Rust-style error block for the first error
      const firstError = errors[0]!;
      errorBlock({
        title: "Compilation failed",
        message: firstError.message,
        location: firstError.location ? `${firstError.location.file}:${firstError.location.line || 1}:${firstError.location.column || 1}` : undefined,
        help: "Fix the errors above and run again."
      });
      process.exit(1);
    } else {
      steps.update(idx++, "done", path.join(path.basename(outDir), "manifest.json"));
      steps.stop();
      blank();
      console.log(`  ${c.warning(icons.warning)} ${c.warning("warning")} · Compiled with ${warnings.length} warning(s)`);
    }
  } else {
    steps.update(idx++, "done", path.join(path.basename(outDir), "manifest.json"));
    steps.stop();
  }

  if (result.success && !env.isQuiet) {
    blank();
    console.log(`  ${c.secondary(`Done in ${elapsed}ms`)}`);
    blank();
  }
}
