#!/usr/bin/env node
// ============================================================================
// packages/cli/index.ts — AXL CLI entry point
// ============================================================================
// The primary developer interface for the AXL platform.
//
//   axl init      — scaffold a new .flow project (interactive)
//   axl validate  — parse and validate .flow files
//   axl compile   — compile .flow → build/manifest.json
//   axl generate  — run configured generators
//   axl doctor    — check installation and environment
// ============================================================================

import { compile } from "./compile.js";
import { validate } from "./validate.js";
import { doctor } from "./doctor.js";
import { init } from "./init.js";
import { generate } from "./generate.js";
import { serve } from "./serve.js";
import { findProjectRoot, loadConfig, resolvePaths } from "./config.js";
import { c, icons, blank, errorBox, didYouMean } from "./ui.js";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
  ${c.brightCyan}${c.bold}AXL${c.reset} ${c.dim}v${VERSION}${c.reset}  ${c.dim}AI-native application specification language${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.dim}$${c.reset} axl <command> [options]

  ${c.bold}Commands${c.reset}
    ${c.cyan}init${c.reset}        Scaffold a new AXL project
    ${c.cyan}validate${c.reset}    Parse and validate all .flow files
    ${c.cyan}compile${c.reset}     Compile .flow files to build/manifest.json
    ${c.cyan}serve${c.reset}       Start the AXL server (MCP over HTTP)
    ${c.cyan}generate${c.reset}    Run configured generators (MCP, OpenAPI)
    ${c.cyan}doctor${c.reset}      Check installation and project health

  ${c.bold}Options${c.reset}
    ${c.cyan}--dir${c.reset} <path>    Path to .flow directory   ${c.dim}(default: ./flow)${c.reset}
    ${c.cyan}--out${c.reset} <path>    Output directory          ${c.dim}(default: ./build)${c.reset}
    ${c.cyan}--verbose${c.reset}       Show detailed output
    ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}     Show this help message
    ${c.cyan}--version${c.reset}, ${c.cyan}-v${c.reset}  Show version

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl init hotel-booking
    ${c.dim}$${c.reset} axl validate
    ${c.dim}$${c.reset} axl compile
    ${c.dim}$${c.reset} axl generate
`;

// ---------------------------------------------------------------------------
// Per-command help
// ---------------------------------------------------------------------------

const COMMAND_HELP: Record<string, string> = {
  init: `
  ${c.brightCyan}${c.bold}axl init${c.reset}  ${c.dim}— Scaffold a new AXL project${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.cyan}axl init${c.reset} [directory]

  ${c.bold}Description${c.reset}
    Creates a new AXL project with template .flow files,
    VS Code configuration, and axl.config.json.

  ${c.bold}Arguments${c.reset}
    ${c.cyan}[directory]${c.reset}   Target directory ${c.dim}(default: current directory)${c.reset}

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl init
    ${c.dim}$${c.reset} axl init my-project
`,

  validate: `
  ${c.brightCyan}${c.bold}axl validate${c.reset}  ${c.dim}— Validate .flow files${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.cyan}axl validate${c.reset} [options]

  ${c.bold}Description${c.reset}
    Parses and validates all .flow files without producing
    any output. Use to check for errors before compiling.

  ${c.bold}Options${c.reset}
    ${c.cyan}--dir${c.reset} <path>   Path to .flow directory ${c.dim}(default: ./flow)${c.reset}

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl validate
    ${c.dim}$${c.reset} axl validate --dir ./my-project/flow
`,

  compile: `
  ${c.brightCyan}${c.bold}axl compile${c.reset}  ${c.dim}— Compile .flow to manifest.json${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.cyan}axl compile${c.reset} [options]

  ${c.bold}Description${c.reset}
    Compiles all .flow files through the AXL pipeline:
    Lexer ${icons.arrow} Parser ${icons.arrow} AST ${icons.arrow} Validator ${icons.arrow} Manifest

  ${c.bold}Options${c.reset}
    ${c.cyan}--dir${c.reset} <path>   Path to .flow directory ${c.dim}(default: ./flow)${c.reset}
    ${c.cyan}--out${c.reset} <path>   Output directory        ${c.dim}(default: ./build)${c.reset}

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl compile
    ${c.dim}$${c.reset} axl compile --dir ./src/flow --out ./dist
`,

  generate: `
  ${c.brightCyan}${c.bold}axl generate${c.reset}  ${c.dim}— Run code generators${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.cyan}axl generate${c.reset} [options]

  ${c.bold}Description${c.reset}
    Reads the compiled manifest.json and runs the configured
    generators (MCP, OpenAPI, etc.) to produce AI artifacts.

  ${c.bold}Options${c.reset}
    ${c.cyan}--out${c.reset} <path>   Build directory with manifest.json ${c.dim}(default: ./build)${c.reset}

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl generate
    ${c.dim}$${c.reset} axl generate --out ./dist
`,

  doctor: `
  ${c.brightCyan}${c.bold}axl doctor${c.reset}  ${c.dim}— Check installation and project health${c.reset}

  ${c.bold}Usage${c.reset}
    ${c.cyan}axl doctor${c.reset}

  ${c.bold}Description${c.reset}
    Runs diagnostic checks on your AXL installation and
    project configuration. Reports issues and suggestions.

  ${c.bold}Examples${c.reset}
    ${c.dim}$${c.reset} axl doctor
`,
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
    if (arg.startsWith("--")) {
      const next = raw[i + 1];
      if (next && !next.startsWith("--")) {
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

const KNOWN_COMMANDS = ["init", "validate", "compile", "serve", "generate", "doctor", "help"];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const verbose = args.booleans.has("--verbose");

  // --version / -v
  if (args.booleans.has("--version") || args.booleans.has("-v")) {
    console.log(`axl ${VERSION}`);
    process.exit(0);
  }

  // --help / -h
  if (!args.command || args.booleans.has("--help") || args.booleans.has("-h") || args.command === "help") {
    // Command-specific help: `axl help compile` or `axl compile --help`
    const helpTarget = args.command === "help" ? args.positional[0] : args.command;
    if (helpTarget && helpTarget !== "help" && COMMAND_HELP[helpTarget]) {
      console.log(COMMAND_HELP[helpTarget]);
    } else {
      console.log(HELP);
    }
    process.exit(0);
  }

  // Unknown command
  if (!KNOWN_COMMANDS.includes(args.command)) {
    const suggestion = didYouMean(args.command, KNOWN_COMMANDS);
    const fix = suggestion ? [`Did you mean ${c.cyan}axl ${suggestion}${c.reset}?`] : [];
    errorBox(
      `Unknown command: ${args.command}`,
      [`Run ${c.cyan}axl --help${c.reset} to see available commands.`],
      fix,
    );
    process.exit(1);
  }

  // Resolve project paths
  // For init, we don't need an existing project root
  if (args.command === "init") {
    const targetDir = args.positional[0] ?? args.flags.get("--dir") ?? ".";
    const skipPrompts = args.booleans.has("--yes") || args.booleans.has("-y");
    await init(targetDir, skipPrompts);
    return;
  }

  // All other commands need project resolution
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    errorBox(
      "Not an AXL project",
      [
        "Could not find an AXL project in the current directory or any",
        "parent directory. An AXL project requires either:",
        "",
        `  ${icons.bullet} An ${c.cyan}axl.config.json${c.reset} file`,
        `  ${icons.bullet} A ${c.cyan}flow/${c.reset} directory`,
      ],
      [`Run ${c.cyan}axl init${c.reset} to create a new project.`],
    );
    process.exit(1);
  }

  const config = loadConfig(projectRoot);

  // Allow CLI flags to override config
  const flowDir = args.positional[0] ?? args.flags.get("--dir") ?? config.flowDir;
  const outDir = args.positional[1] ?? args.flags.get("--out") ?? config.outDir;

  // Resolve to absolute
  const paths = resolvePaths(projectRoot, {
    ...config,
    flowDir,
    outDir,
  });

  try {
    switch (args.command) {
      case "validate":
        validate(paths.flowDir);
        break;
      case "compile":
        compile(paths.flowDir, paths.outDir);
        break;
      case "serve":
        await serve(paths.outDir, { port: args.flags.get("--port") ? parseInt(args.flags.get("--port")!, 10) : undefined });
        break;
      case "generate":
        await generate(paths.flowDir, paths.outDir);
        break;
      case "doctor":
        doctor(paths.flowDir);
        break;
    }
  } catch (err) {
    if (verbose && err instanceof Error) {
      console.error(err.stack);
    } else if (err instanceof Error) {
      errorBox("Unexpected error", [err.message], [
        "Run with --verbose for the full stack trace.",
      ]);
    }
    process.exit(1);
  }
}

main();
