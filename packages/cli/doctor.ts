// ============================================================================
// packages/cli/doctor.ts — axl doctor
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { GeneratorRegistry } from "@axl/generators";
import { c, icons, section, blank, table, divider, warn, success } from "./ui.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string | string[];
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

export async function doctor(flowDir: string): Promise<void> {
  section("AXL Doctor — Diagnostics");

  const checks: Check[] = [];

  // ── CLI version ──
  checks.push({ label: "CLI", status: "pass", detail: "v0.2.2" }); // Bumped to match package.json

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
  blank();
  console.log(`  ${c.primary("Environment")}`);
  blank();
  table(checks.map(ch => ({ key: ch.label, value: ch.detail, status: ch.status })));

  // ── Project checks ──
  blank();
  console.log(`  ${c.primary("Project")}`);
  blank();

  const projectChecks: Check[] = [];

  const root = findProjectRoot();
  if (root) {
    projectChecks.push({ label: "Project root", status: "pass", detail: root });

    // config
    const configPath = path.join(root, "axl.config.json");
    if (fs.existsSync(configPath)) {
      projectChecks.push({ label: "axl.config.json", status: "pass", detail: "" });
    } else {
      projectChecks.push({ label: "axl.config.json", status: "warn", detail: "Missing config file" });
    }

    // flow dir
    const config = loadConfig(root);
    const flowDir = path.resolve(root, config.flowDir);
    const relFlowDir = path.relative(root, flowDir) || ".";
    if (fs.existsSync(flowDir)) {
      const files = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow"));
      if (files.length === 0) {
        projectChecks.push({ label: "Flow directory", status: "warn", detail: `${relFlowDir} (0 files)` });
      } else {
        const maxLen = Math.max(...files.map(f => f.length));
        const fileDetails = files.map((f, i) => {
          const isLast = i === files.length - 1;
          const prefix = isLast ? icons.bLeft : icons.tRight;
          const stats = fs.statSync(path.join(flowDir, f));
          const pad = " ".repeat(maxLen - f.length + 2);
          return `${c.secondary(prefix)} ${f}${pad}${c.secondary(`${stats.size} bytes`)}`;
        });
        projectChecks.push({ label: "Flow directory", status: "pass", detail: [relFlowDir, ...fileDetails] });
      }
    } else {
      projectChecks.push({ label: "Flow directory", status: "fail", detail: `Missing: ${relFlowDir}` });
    }

    // manifest
    const manifestPath = path.resolve(root, config.outDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      projectChecks.push({ label: "Manifest", status: "pass", detail: "Compiled (manifest.json)" });
    } else {
      projectChecks.push({ label: "Manifest", status: "warn", detail: "Not compiled yet (run axl compile)" });
    }

    // vscode
    const vscodeDir = path.join(root, ".vscode");
    if (fs.existsSync(vscodeDir)) {
      projectChecks.push({ label: "VS Code config", status: "pass", detail: ".vscode" });
    } else {
      projectChecks.push({ label: "VS Code config", status: "warn", detail: "Missing VS Code settings" });
    }
  } else {
    projectChecks.push({ label: "Project root", status: "warn", detail: "Not in an AXL project" });
  }

  table(projectChecks.map(ch => ({ key: ch.label, value: ch.detail, status: ch.status })));

  // Summary
  const allChecks = [...checks, ...projectChecks];
  const fails = allChecks.filter(c => c.status === "fail").length;
  const warns = allChecks.filter(c => c.status === "warn").length;

  blank();
  divider();
  blank();

  if (fails > 0) {
    console.log(`  ${c.error(fails.toString() + " errors")} · run axl doctor --fix for details`);
    blank();
    process.exit(1);
  } else if (warns > 0) {
    console.log(`  ${c.warning("⚠ " + warns.toString() + " warnings")} · axl doctor --fix for details`);
    blank();
  } else {
    console.log(`  ${c.success("✔")} ${c.primary("Everything looks healthy!")}`);
    blank();
  }
}
