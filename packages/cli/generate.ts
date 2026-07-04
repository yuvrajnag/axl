// ============================================================================
// packages/cli/generate.ts — axl generate
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "@axl/compiler";
import { GeneratorRegistry } from "@axl/generators";
import * as ui from "./ui.js";
import { c, icons } from "./ui.js";

export async function generate(flowDir: string, outDir: string): Promise<void> {
  ui.banner("AXL Generate", "Reading manifest and running generators");
  ui.blank();

  const manifestPath = path.resolve(path.join(outDir, "manifest.json"));

  if (!fs.existsSync(manifestPath)) {
    ui.errorBox(
      "Manifest not found",
      [
        `Expected: ${c.dim}${manifestPath}${c.reset}`,
        "",
        "The manifest is produced by the compiler. You need to compile",
        "your .flow files before running generators.",
      ],
      [`Run ${c.cyan}axl compile${c.reset} first.`],
    );
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content) as Manifest;
  } catch (err) {
    ui.errorBox(
      "Invalid manifest",
      [
        `Could not parse: ${c.dim}${manifestPath}${c.reset}`,
        err instanceof Error ? err.message : String(err),
      ],
      [`Try recompiling: ${c.cyan}axl compile${c.reset}`],
    );
    process.exit(1);
  }

  ui.step("Manifest loaded", `${c.dim}${manifest.app.name} v${manifest.app.version}${c.reset}`);

  const generators = manifest.app.generators ?? [];

  if (generators.length === 0) {
    ui.blank();
    ui.warn("No generators specified in app.flow.");
    ui.blank();
    ui.dim("Add a GENERATORS block to your app.flow:");
    ui.blank();
    ui.dim("  GENERATORS");
    ui.dim("    MCP");
    ui.dim("    OPENAPI");
    ui.blank();
    process.exit(0);
  }

  const generatedDir = path.resolve("generated");
  const start = performance.now();
  let totalFiles = 0;

  for (const genId of generators) {
    const generator = GeneratorRegistry.get(genId);

    if (!generator) {
      const available = [...GeneratorRegistry.keys()];
      const suggestion = ui.didYouMean(genId, available);
      ui.error(`Generator '${c.bold}${genId}${c.reset}' is not implemented`);
      if (suggestion) {
        ui.dim(`  Did you mean ${c.cyan}${suggestion}${c.reset}?`);
      }
      ui.dim(`  Available: ${available.join(", ")}`);
      continue;
    }

    ui.info(`Running ${c.bold}${generator.id}${c.reset} generator...`);

    const files = await generator.generate(manifest);

    for (const file of files) {
      const fullPath = path.join(generatedDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, "utf-8");
      ui.dim(`  ${icons.arrow} ${file.path}`);
      totalFiles++;
    }

    ui.step(`${generator.id}`, `${c.dim}${files.length} file(s)${c.reset}`);
  }

  const elapsed = (performance.now() - start).toFixed(0);

  ui.blank();
  ui.success(`Generation complete: ${c.bold}${totalFiles}${c.reset} file(s) in ${c.bold}${elapsed}ms${c.reset}`);
  ui.blank();
  ui.dim(`Output: ${generatedDir}`);
  ui.blank();
}
