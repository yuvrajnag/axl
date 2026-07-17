# Installation Guide

AXL provides a command-line interface (CLI) to initialize, validate, compile, and run your backend logic. It also requires the AXL VS Code extension for full IDE support (syntax highlighting, diagnostics, and autocomplete).

## System Requirements

- **Node.js**: `v18.0.0` or higher.
- **Package Manager**: `npm`, `pnpm`, `yarn`, or `bun`.
- **VS Code**: Recommended for writing `.flow` files.

---

## 1. Global Installation (Recommended)

The easiest way to use AXL across multiple projects is to install the CLI globally.

### npm
```bash
npm install -g scl-axl
```

### pnpm
```bash
pnpm add -g scl-axl
```

### bun
```bash
bun add -g scl-axl
```

### yarn
```bash
yarn global add scl-axl
```

Once installed globally, you can initialize a new project anywhere:
```bash
axl init my-project
cd my-project
```

---

## 2. Local Installation

If you prefer to lock your AXL version per-project, you can install it locally as a dev dependency.

```bash
mkdir my-project && cd my-project
npm init -y
npm install --save-dev scl-axl
```

You can then run commands via `npx`:
```bash
npx axl init
npx axl compile
npx axl serve
```

---

## 3. VS Code Extension

Writing `.flow` files without syntax highlighting is difficult. AXL provides an official VS Code extension that connects directly to the compiler.

1. Open VS Code.
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **AXL Language Features**.
4. Click **Install**.

*Alternatively, you can download the `.vsix` file from the [Releases](https://github.com/yuvrajnag/axl/releases) page and install it manually via the VS Code command palette: `Extensions: Install from VSIX...`*

---

## 4. Troubleshooting

### "Command not found: axl"
If you installed AXL globally but your terminal says `command not found`, your global npm packages directory is likely missing from your system's `PATH`.
- **Windows**: Add `%USERPROFILE%\AppData\Roaming\npm` to your `PATH` environment variable.
- **Mac/Linux**: Add `export PATH="$HOME/.npm-global/bin:$PATH"` to your `~/.bashrc` or `~/.zshrc`.
Alternatively, prefix all commands with `npx`, e.g., `npx axl doctor`.

### "EACCES: permission denied" on Global Install
If you encounter permission errors on Mac/Linux during `npm install -g`, do not use `sudo`. Instead, configure npm to use a different directory, or use a Node version manager like `nvm`.

### Module Resolution Errors on `axl serve`
If `axl serve` fails to start because it cannot resolve `axl-server.js`, ensure you have run `npm install` inside the generated project directory before attempting to serve.
