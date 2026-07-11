#!/usr/bin/env node
// ============================================================================
// packages/cli/index.ts — AXL CLI entry point
// ============================================================================

import { compile } from "./compile.js";
import { validate } from "./validate.js";
import { doctor } from "./doctor.js";
import { init } from "./init.js";
import { generate } from "./generate.js";
import { serve } from "./serve.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";
import { c, icons, blank, errorBlock, didYouMean, env, warn } from "./ui.js";
import { GeneratorRegistry } from "@axl/generators";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

function getVersion() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return "0.2.0";
  }
}

const VERSION = getVersion();

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = () => {
  return `
  axl v${VERSION} · AI Experience Layer

  ${c.primary("Usage")}
    axl <command> [options]

  ${c.primary("Core")}
    init         ${c.plain("scaffold a new project")}
    validate     ${c.plain("check flow files")}
    compile      ${c.plain("build the manifest")}
    generate     ${c.plain("generate code from manifest")}
    build        ${c.plain("compile + generate")}

  ${c.primary("Dev")}
    serve        ${c.plain("start the AXL server (MCP over HTTP)")}
    dev          ${c.plain("watch mode")}
    doctor       ${c.plain("diagnose environment & project")}
    info         ${c.plain("print project metadata")}

  ${c.primary("Utility")}
    clean        ${c.plain("remove build output")}
    format       ${c.plain("format flow files")}
    lint         ${c.plain("lint flow files")}
    config       ${c.plain("view or edit axl.config.json")}

  ${c.primary("Options")}
    -h, --help      ${c.plain("show help")}
    -v, --version   ${c.plain("print version")}
    --json          ${c.plain("machine-readable output")}
    --quiet         ${c.plain("suppress non-essential output")}
    --verbose       ${c.plain("extra diagnostic output")}

    ${c.secondary("axl init  ·  axl compile  ·  axl doctor")}

  ${c.secondary("docs " + icons.arrow)} ${c.accent("axl.dev")}
`;
};

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string>;
  booleans: Set<string>;
}

function parseArgs(raw: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const booleans = new Set<string>();
  const positional: string[] = [];
  let command: string | undefined;

  let i = 0;
  // First non-flag argument is the command
  while (i < raw.length) {
    const arg = raw[i]!;
    if (arg.startsWith("-")) {
      const next = raw[i + 1];
      if (next && !next.startsWith("-")) {
        flags.set(arg, next);
        i += 2;
      } else {
        booleans.add(arg);
        i++;
      }
    } else if (!command) {
      command = arg;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags, booleans };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const KNOWN_COMMANDS = ["init", "validate", "compile", "serve", "generate", "build", "dev", "doctor", "info", "clean", "format", "lint", "config", "help"];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const verbose = args.booleans.has("--verbose");
  env.isQuiet = args.booleans.has("--quiet");
  env.isJson = args.booleans.has("--json");

  // --version / -v
  if (args.booleans.has("--version") || args.booleans.has("-v")) {
    console.log(`axl ${VERSION}`);
    process.exit(0);
  }

  // --help / -h
  if (!args.command || args.booleans.has("--help") || args.booleans.has("-h") || args.command === "help") {
    console.log(HELP());
    process.exit(0);
  }

  // Unknown command
  if (!KNOWN_COMMANDS.includes(args.command)) {
    const suggestion = didYouMean(args.command, KNOWN_COMMANDS);
    const fix = suggestion ? `Did you mean axl ${suggestion}?` : `Run axl --help to see available commands.`;
    errorBlock({
      title: `Unknown command: ${args.command}`,
      help: fix
    });
    process.exit(1);
  }

  // Resolve project paths
  if (args.command === "init") {
    const targetDir = args.positional[0] ?? args.flags.get("--dir") ?? ".";
    const skipPrompts = args.booleans.has("--yes") || args.booleans.has("-y");
    await init(targetDir, skipPrompts);
    return;
  }

  // All other commands need project resolution
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    errorBlock({
      title: "Not an AXL project",
      message: "Could not find an AXL project in the current directory or any parent directory.",
      help: [
        "An AXL project requires either:",
        `  ${icons.dot} An axl.config.json file`,
        `  ${icons.dot} A flow/ directory`,
        "",
        "Run axl init to create a new project."
      ]
    });
    process.exit(1);
  }

  const config = loadConfig(projectRoot);

  const flowDir = args.positional[0] ?? args.flags.get("--dir") ?? config.flowDir;
  const outDir = args.positional[1] ?? args.flags.get("--out") ?? config.outDir;

  const paths = resolvePaths(projectRoot, {
    ...config,
    flowDir,
    outDir,
  });

  try {
    switch (args.command) {
      case "validate":
        await validate(paths.flowDir);
        break;
      case "compile":
        await compile(paths.flowDir, paths.outDir);
        break;
      case "serve":
        await serve(paths.outDir, { port: args.flags.get("--port") ? parseInt(args.flags.get("--port")!, 10) : undefined });
        break;
      case "generate":
        await generate(paths.flowDir, paths.outDir);
        break;
      case "doctor":
        await doctor(paths.flowDir);
        break;
      case "build":
      case "dev":
      case "info":
      case "clean":
      case "format":
      case "lint":
      case "config":
        warn(`Command '${args.command}' is not fully implemented yet.`);
        break;
    }
  } catch (err) {
    if (verbose && err instanceof Error) {
      console.error(err.stack);
    } else if (err instanceof Error) {
      errorBlock({
        title: "Unexpected error",
        message: err.message,
        help: "Run with --verbose for the full stack trace."
      });
    }
    process.exit(1);
  }
}

main();
