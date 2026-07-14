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
import { build } from "./build.js";
import { dev } from "./dev.js";
import { info } from "./info.js";
import { clean } from "./clean.js";
import { format } from "./format.js";
import { lint } from "./lint.js";
import { configCmd } from "./config_cmd.js";
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
  ${c.secondary("The declarative backend engine for serverless workflows and AI agents.")}

  ${c.primary("Usage")}
    axl <command> [options]

  ${c.primary("Core Commands")}
    init         ${c.plain("scaffold a new project in the current or specified directory")}
    validate     ${c.plain("type-check and validate all .flow files")}
    compile      ${c.plain("build the manifest.json execution graph")}
    generate     ${c.plain("generate typescript client/server code from the manifest")}
    build        ${c.plain("run compile + generate sequentially")}

  ${c.primary("Development Commands")}
    serve        ${c.plain("start the AXL Engine (REST & MCP transports)")}
    dev          ${c.plain("start watch mode, recompiling on file changes")}
    doctor       ${c.plain("diagnose environment and project health")}
    info         ${c.plain("print parsed project configuration and metadata")}

  ${c.primary("Utility Commands")}
    clean        ${c.plain("remove build/ and generated/ outputs")}
    format       ${c.plain("auto-format .flow files to standard style")}
    lint         ${c.plain("lint .flow files for warnings and best practices")}
    config       ${c.plain("view or edit axl.config.json")}

  ${c.primary("Global Options")}
    -h, --help      ${c.plain("show help for axl or a specific command")}
    -v, --version   ${c.plain("print the current version")}
    --json          ${c.plain("format output as machine-readable JSON")}
    --quiet         ${c.plain("suppress non-essential output")}
    --verbose       ${c.plain("enable extra diagnostic logging")}

  ${c.primary("Examples")}
    axl init my-app
    axl compile --dir ./flow --out ./build
    axl serve --both --port 8080

  ${c.secondary("Run 'axl <command> --help' for command-specific options.")}
  ${c.secondary("docs " + icons.arrow)} ${c.accent("github.com/yuvrajnag/axl")}
`;
};

const COMMAND_HELP = (cmd: string) => {
  const helps: Record<string, string> = {
    init: `
  axl init · Scaffold a new project

  ${c.primary("Usage")}
    axl init [dir] [options]

  ${c.primary("Options")}
    -y, --yes       ${c.plain("skip interactive prompts")}
    --dir <path>    ${c.plain("target directory (default: current directory)")}

  ${c.primary("Examples")}
    axl init my-project -y
`,
    compile: `
  axl compile · Build the execution manifest

  ${c.primary("Usage")}
    axl compile [options]

  ${c.primary("Options")}
    --dir <path>    ${c.plain("source directory containing .flow files")}
    --out <path>    ${c.plain("output directory for manifest.json")}

  ${c.primary("Examples")}
    axl compile
    axl compile --dir src/flow --out dist/
`,
    serve: `
  axl serve · Start the AXL Engine

  ${c.primary("Usage")}
    axl serve [options]

  ${c.primary("Options")}
    --port <num>    ${c.plain("port to bind the server to (default: 3960)")}
    --rest          ${c.plain("mount the REST API endpoints (/actions, /workflows)")}
    --both          ${c.plain("mount both REST and MCP endpoints")}
    --trust-proxy   ${c.plain("trust X-Forwarded-For headers (for rate limiting)")}
    --state-file    ${c.plain("path to a JSON file for persistent state")}
    --dir <path>    ${c.plain("directory containing .flow files")}
    --out <path>    ${c.plain("directory containing the compiled manifest.json")}

  ${c.primary("Examples")}
    axl serve                   ${c.secondary("(MCP only)")}
    axl serve --both --port 80  ${c.secondary("(REST + MCP on port 80)")}
    axl serve --rest            ${c.secondary("(REST only)")}
`
  };

  return helps[cmd] || `
  ${c.primary(`axl ${cmd}`)}
  Run this command to execute the ${cmd} operation.
  Use global options like --dir or --out to customize paths.
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
  if (args.booleans.has("--help") || args.booleans.has("-h") || args.command === "help") {
    const cmd = args.command === "help" ? args.positional[0] : args.command;
    if (cmd && KNOWN_COMMANDS.includes(cmd)) {
      console.log(COMMAND_HELP(cmd));
    } else {
      console.log(HELP());
    }
    process.exit(0);
  }

  if (!args.command) {
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

  // Validate flags
  const GLOBAL_FLAGS = ["--verbose", "--quiet", "--json", "--help", "-h", "--version", "-v"];
  const CMD_FLAGS: Record<string, string[]> = {
    init: ["--yes", "-y", "--dir"],
    serve: ["--port", "--dir", "--out", "--trust-proxy", "--state-file", "--rest", "--both"],
    validate: ["--dir", "--out"],
    compile: ["--dir", "--out"],
    generate: ["--dir", "--out"],
    build: ["--dir", "--out"],
    dev: ["--dir", "--out"],
    doctor: ["--dir", "--out"], // --fix is intentionally excluded
    info: ["--dir", "--out"],
    clean: ["--dir", "--out"],
    format: ["--dir", "--out"],
    lint: ["--dir", "--out"],
    config: ["--dir", "--out"],
    help: [],
  };

  const allowedFlags = new Set([...GLOBAL_FLAGS, ...(CMD_FLAGS[args.command] || [])]);
  const providedFlags = [...args.flags.keys(), ...args.booleans];
  for (const flag of providedFlags) {
    if (!allowedFlags.has(flag)) {
      if (args.command === "doctor" && flag === "--fix") {
        errorBlock({
          title: `Option not implemented`,
          help: `The --fix flag is not yet implemented.`,
        });
        process.exit(1);
      }
      const suggestion = didYouMean(flag, Array.from(allowedFlags));
      const fix = suggestion ? `Did you mean ${suggestion}?` : `Run axl ${args.command} --help to see available options.`;
      errorBlock({
        title: `Unknown option: ${flag}`,
        help: fix
      });
      process.exit(1);
    }
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
        await serve(paths.outDir, {
          port: args.flags.get("--port") ? parseInt(args.flags.get("--port")!, 10) : undefined,
          trustProxy: args.booleans.has("--trust-proxy"),
          stateFile: args.flags.get("--state-file") ?? config.stateFile,
          rest: args.booleans.has("--rest"),
          both: args.booleans.has("--both"),
          cookieKey: config.auth?.cookieKey
        });
        break;
      case "generate":
        await generate(paths.flowDir, paths.outDir);
        break;
      case "doctor":
        await doctor(paths.flowDir);
        break;
      case "build":
        await build(paths.flowDir, paths.outDir);
        break;
      case "dev":
        await dev(paths.flowDir, paths.outDir);
        break;
      case "info":
        await info(config, paths);
        break;
      case "clean":
        await clean(paths.outDir, paths.generatedDir || path.join(projectRoot, "generated"));
        break;
      case "format":
        await format(paths.flowDir);
        break;
      case "lint":
        await lint(paths.flowDir);
        break;
      case "config":
        await configCmd(projectRoot, args.positional);
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
