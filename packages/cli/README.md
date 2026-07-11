# AXL CLI

AXL is an AI-native application specification language. It allows you to design and describe your application's workflows, entities, permissions, and actions using `.flow` files, which compile down to a central manifest to generate backend code, docs, and AI artifacts (like MCP tools and OpenAPI specs).

## Installation

```bash
npm install -g scl-axl
```

## Commands

- `axl init` - Scaffold a new AXL project in the current directory.
- `axl validate` - Parse and validate your `.flow` files for syntax and semantic correctness.
- `axl compile` - Compile your `.flow` files into `build/manifest.json`.
- `axl generate` - Run configured generators (e.g. MCP, OpenAPI, DIAGRAM) based on your manifest.
- `axl doctor` - Run diagnostic checks on your AXL installation and project configuration.
- `axl serve` - Start the AXL server (MCP over HTTP) for AI agents to connect to.

## Quickstart

Create a new AXL project, compile it, and generate your application artifacts in three easy steps:

```bash
# 1. Initialize a new project
axl init my-app
cd my-app

# 2. Compile .flow files to a manifest
axl compile

# 3. Generate your application artifacts
axl generate
```
