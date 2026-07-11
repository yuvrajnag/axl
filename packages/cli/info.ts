// ============================================================================
// packages/cli/info.ts — axl info
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, table, blank, env, warn } from "./ui.js";

export async function info(config: any, paths: any): Promise<void> {
  if (!env.isQuiet) {
    section("Project Info");
  }

  const projectRoot = paths.flowDir.replace(/[/\\]flow$/, "");
  const manifestPath = path.join(paths.outDir, "manifest.json");
  
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {}
  }

  const tableData = [
    { key: "Project Root", value: projectRoot },
    { key: "Flow Directory", value: path.relative(projectRoot, paths.flowDir) || "." },
    { key: "Output Directory", value: path.relative(projectRoot, paths.outDir) || "." },
    { key: "Generators", value: config.generators?.join(", ") || "None" }
  ];

  table(tableData);
  blank();

  if (manifest) {
    section("Manifest Statistics");
    const stats = [
      { key: "Entities", value: Object.keys(manifest.entities || {}).length.toString() },
      { key: "Workflows", value: Object.keys(manifest.workflows || {}).length.toString() },
      { key: "Endpoints", value: manifest.endpoints?.length.toString() || "0" }
    ];
    table(stats);
    blank();
  } else {
    warn("Manifest not found. Run 'axl build' to compile flow files.");
    blank();
  }
}
