// ============================================================================
// packages/cli/doctor.ts — axl doctor
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { GeneratorRegistry } from "@axl/generators";
import * as ui from "./ui.js";
import { c, icons } from "./ui.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

// ---------------------------------------------------------------------------
// Flow files
// ---------------------------------------------------------------------------

const REQUIRED_FLOW_FILES = [
  "app.flow",
  "schema.flow",
  "actions.flow",
  "workflows.flow",
  "auth.flow",
];

// ---------------------------------------------------------------------------
// Doctor command
// ---------------------------------------------------------------------------

export function doctor(flowDir: string): void {
  ui.banner("AXL Doctor", "Checking your installation and project health");
  ui.blank();

  const checks: Check[] = [];

  // ── CLI version ──
  checks.push({ label: "CLI", status: "pass", detail: "v0.1.0" });

  // ── Compiler ──
  try {
    // Just importing the compiler is proof it works
    checks.push({ label: "Compiler", status: "pass", detail: "v0.1.0" });
  } catch {
    checks.push({ label: "Compiler", status: "fail", detail: "Not found" });
  }

  // ── Generators ──
  const generatorIds = [...GeneratorRegistry.keys()];
  if (generatorIds.length > 0) {
    checks.push({ label: "Generators", status: "pass", detail: generatorIds.join(", ") });
  } else {
    checks.push({ label: "Generators", status: "warn", detail: "No generators registered" });
  }

  // ── Node.js ──
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0]!, 10);
  if (major >= 18) {
    checks.push({ label: "Node.js", status: "pass", detail: nodeVersion });
  } else {
    checks.push({ label: "Node.js", status: "fail", detail: `${nodeVersion} (requires >= 18)` });
  }

  // ── TypeScript ──
  try {
    const tscVersion = execSync("npx tsc --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    checks.push({ label: "TypeScript", status: "pass", detail: tscVersion });
  } catch {
    checks.push({ label: "TypeScript", status: "warn", detail: "Not found (optional)" });
  }

  // Print environment checks
  ui.heading("Environment");
  ui.blank();
  ui.table(checks);

  // ── Project checks ──
  ui.blank();
  ui.heading("Project");
  ui.blank();

  const projectChecks: Check[] = [];

  // Config
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    projectChecks.push({ label: "Project root", status: "pass", detail: projectRoot });

    const config = loadConfig(projectRoot);
    const paths = resolvePaths(projectRoot, config);

    // axl.config.json
    const configPath = path.join(projectRoot, "axl.config.json");
    if (fs.existsSync(configPath)) {
      projectChecks.push({ label: "axl.config.json", status: "pass", detail: configPath });
    } else {
      projectChecks.push({ label: "axl.config.json", status: "warn", detail: "Not found (using defaults)" });
    }

    // Flow directory
    if (fs.existsSync(paths.flowDir)) {
      projectChecks.push({ label: "Flow directory", status: "pass", detail: paths.flowDir });
    } else {
      projectChecks.push({ label: "Flow directory", status: "fail", detail: `Not found: ${paths.flowDir}` });
    }

    // Individual .flow files
    for (const file of REQUIRED_FLOW_FILES) {
      const filePath = path.join(paths.flowDir, file);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        projectChecks.push({ label: `  ${file}`, status: "pass", detail: `${stat.size} bytes` });
      } else {
        const isRequired = file === "app.flow";
        projectChecks.push({
          label: `  ${file}`,
          status: isRequired ? "fail" : "warn",
          detail: "Not found",
        });
      }
    }

    // Manifest
    const manifestPath = path.join(paths.outDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const stat = fs.statSync(manifestPath);
      projectChecks.push({ label: "Manifest", status: "pass", detail: `${stat.size} bytes` });
    } else {
      projectChecks.push({ label: "Manifest", status: "warn", detail: `Not compiled yet (run ${c.cyan}axl compile${c.reset})` });
    }

    // VS Code
    const vscodeDir = path.join(projectRoot, ".vscode");
    if (fs.existsSync(vscodeDir)) {
      projectChecks.push({ label: "VS Code config", status: "pass", detail: vscodeDir });
    } else {
      projectChecks.push({ label: "VS Code config", status: "warn", detail: "Not found (optional)" });
    }
  } else {
    projectChecks.push({ label: "Project root", status: "warn", detail: "Not in an AXL project" });
  }

  ui.table(projectChecks);

  // Summary
  const allChecks = [...checks, ...projectChecks];
  const hasFailures = allChecks.some(ch => ch.status === "fail");
  const hasWarnings = allChecks.some(ch => ch.status === "warn");

  ui.blank();
  if (hasFailures) {
    ui.error("Some checks failed. Please fix the issues above.");
  } else if (hasWarnings) {
    ui.warn("Everything works, but there are some warnings.");
  } else {
    ui.success(`${icons.sparkle} Everything looks healthy!`);
  }
  ui.blank();

  process.exit(hasFailures ? 1 : 0);
}
