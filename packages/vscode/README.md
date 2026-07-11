# AXL Flow — VS Code Extension

Language support for the [AXL](https://github.com/yuvrajnag/axl) `.flow` specification language.

## Features

### Syntax Highlighting
Full TextMate grammar for `.flow` files — keywords, types, strings, comments, and identifiers are all highlighted with appropriate scopes.

### Hover Tooltips
Hover over any **ACTION** or **ENTITY** name to see its definition pulled from your project's `.flow` files:
- **Actions**: description, input fields with types, output type, endpoint, permission level
- **Entities**: field list with types

The extension parses your `.flow` files directly using the real AXL compiler — it works even before you've run `axl compile`.

### Inline Diagnostics
Real-time squiggly underlines for errors and warnings as you edit. Uses the exact same validation pipeline as `axl validate`, so you see the same AXL error codes (AXL300, AXL310, etc.) in the editor that you'd see in the terminal.

Diagnostics run on file save and on a debounced delay after edits.

### Snippets
Type a prefix and press Tab to scaffold common blocks:
- `action` → full ACTION / DESC / INPUT / OUTPUT / ENDPOINT scaffold
- `entity` → ENTITY with field list
- `workflow` → WORKFLOW / STEP scaffold
- `permission` → PERMISSION line

### Format on Save
Format `.flow` files using the same formatting rules as `axl format`. Enable VS Code's "Format on Save" setting to auto-format on every save.

## Requirements

- VS Code 1.85.0+
- An AXL project with a `flow/` directory

## Building

```bash
cd packages/vscode
npm install
npm run build
```

The extension bundles to `dist/extension.js` via esbuild.

## Installing Locally

1. Build the extension
2. Copy the `packages/vscode` folder to `~/.vscode/extensions/axl-flow`
3. Restart VS Code

Or package as a `.vsix` with `npx @vscode/vsce package`.
