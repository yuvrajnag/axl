import fs from "fs";

/**
 * Loads a compiled manifest.json produced by the AXL compiler.
 *
 * The runtime NEVER parses .flow files directly.
 * Only the compiler understands the DSL.
 * The engine consumes manifest.json exclusively.
 *
 * Expected manifest shape:
 * {
 *   app: { name, displayName, version, description, framework, language, database, base_url },
 *   entities: [...],
 *   actions: { <name>: { description, input, output, endpoint, permission, confirm } },
 *   workflows: [...],
 *   permissions: { ... },
 *   rateLimits: { ... }
 * }
 */
export function loadManifest(manifestJsonPath) {
  if (!fs.existsSync(manifestJsonPath)) {
    throw new Error(
      `Manifest not found: ${manifestJsonPath}\n` +
      `Run "axl compile" to generate the manifest from your .flow files.`
    );
  }

  const raw = fs.readFileSync(manifestJsonPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest.json: ${err instanceof Error ? err.message : err}\n` +
      `The file may be corrupted. Run "axl compile" to regenerate.`
    );
  }

  // Validate required top-level keys
  if (!manifest.app) {
    throw new Error('manifest.json missing required field: "app"');
  }
  if (!manifest.app.base_url) {
    throw new Error('manifest.json missing required field: "app.base_url"');
  }
  if (!manifest.actions || typeof manifest.actions !== "object") {
    throw new Error('manifest.json missing required field: "actions"');
  }

  return manifest;
}
