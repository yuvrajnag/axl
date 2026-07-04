// ============================================================================
// packages/cli/validate.ts — axl validate
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { Compiler, formatDiagnostics, DiagnosticSeverity } from "@axl/compiler";
import * as ui from "./ui.js";
import { c, icons } from "./ui.js";

const FLOW_FILES = [
  "app.flow",
  "schema.flow",
  "actions.flow",
  "workflows.flow",
  "auth.flow",
];

export function validate(flowDir: string): void {
  ui.banner("Validating AXL", flowDir);
  ui.blank();

  // Show which files exist
  const resolvedDir = path.resolve(flowDir);
  const found: string[] = [];
  const missing: string[] = [];

  for (const file of FLOW_FILES) {
    const filePath = path.join(resolvedDir, file);
    if (fs.existsSync(filePath)) {
      found.push(file);
    } else {
      missing.push(file);
    }
  }

  if (found.length === 0) {
    ui.errorBox(
      "No .flow files found",
      [`Directory: ${resolvedDir}`],
      [`Run ${c.cyan}axl init${c.reset} to create a new project.`],
    );
    process.exit(1);
  }

  // Run validation
  const start = performance.now();
  const compiler = new Compiler(flowDir);
  const diagnostics = compiler.validate();
  const elapsed = (performance.now() - start).toFixed(0);

  // Show per-file status
  for (const file of found) {
    const fileDiags = diagnostics.filter(d => d.location.file === file);
    const fileErrors = fileDiags.filter(d => d.severity === DiagnosticSeverity.Error);
    if (fileErrors.length > 0) {
      ui.error(`${file} ${c.dim}(${fileErrors.length} error${fileErrors.length > 1 ? "s" : ""})${c.reset}`);
    } else {
      ui.success(file);
    }
  }

  for (const file of missing) {
    ui.dim(`${icons.dot} ${file} (not found)`);
  }

  // Show diagnostics
  if (diagnostics.length > 0) {
    ui.blank();
    console.log(formatDiagnostics(diagnostics));
  }

  // Summary
  const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
  const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

  ui.blank();

  if (errors.length > 0) {
    ui.error(`Validation failed: ${c.red}${errors.length}${c.reset} error(s), ${c.yellow}${warnings.length}${c.reset} warning(s) ${c.dim}(${elapsed}ms)${c.reset}`);
    ui.blank();
    process.exit(1);
  }

  if (warnings.length > 0) {
    ui.warn(`Validation passed with ${c.yellow}${warnings.length}${c.reset} warning(s) ${c.dim}(${elapsed}ms)${c.reset}`);
  } else {
    ui.success(`No errors found ${c.dim}(${elapsed}ms)${c.reset}`);
  }
  ui.blank();
}
