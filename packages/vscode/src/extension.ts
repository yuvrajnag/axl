// ============================================================================
// packages/vscode/src/extension.ts — AXL Flow VS Code extension entry point
// ============================================================================

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { Parser } from "@axl/compiler";
import type { ProjectAST, AppNode, EntityNode, ActionNode, WorkflowNode, AuthAST } from "@axl/compiler";
import { DiagnosticSeverity } from "@axl/compiler";
import { getHoverInfo } from "./hover.js";
import { getDiagnostics } from "./diagnostics.js";
import { formatFlowSource } from "./formatter.js";

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("axl-flow");
  context.subscriptions.push(diagnosticCollection);

  // -- Hover Provider -------------------------------------------------------
  const hoverProvider = vscode.languages.registerHoverProvider("flow", {
    provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
      if (!wordRange) return null;

      const word = document.getText(wordRange);
      const ast = parseWorkspaceFlowFiles(document.uri);
      if (!ast) return null;

      const info = getHoverInfo(word, ast);
      if (!info) return null;

      return new vscode.Hover(new vscode.MarkdownString(info), wordRange);
    },
  });
  context.subscriptions.push(hoverProvider);

  // -- Diagnostics ----------------------------------------------------------
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function runDiagnostics(docUri?: vscode.Uri) {
    const sources = readWorkspaceFlowSources(docUri);
    if (!sources) {
      if (!docUri) diagnosticCollection.clear();
      return;
    }

    const diags = getDiagnostics(sources);

    // Group diagnostics by file
    const fileMap = new Map<string, vscode.Diagnostic[]>();

    for (const d of diags) {
      const fileName = d.location.file;
      const line = Math.max(0, d.location.line - 1); // VS Code is 0-indexed
      const col = Math.max(0, d.location.column - 1);
      const range = new vscode.Range(line, col, line, col + 20);
      const severity =
        d.severity === DiagnosticSeverity.Error
          ? vscode.DiagnosticSeverity.Error
          : d.severity === DiagnosticSeverity.Warning
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;

      const vsDiag = new vscode.Diagnostic(range, `${d.code}: ${d.message}`, severity);
      vsDiag.source = "axl";

      if (!fileMap.has(fileName)) {
        fileMap.set(fileName, []);
      }
      fileMap.get(fileName)!.push(vsDiag);
    }

    diagnosticCollection.clear();

    const flowDir = findFlowDir(docUri);
    if (!flowDir) return;

    // Clear diagnostics only for the files we are updating in this flow dir
    // Wait, the easiest way is to clear and reset, but we might have multiple flow dirs.
    // We'll just reset for the files we found.
    for (const [fileName, vsdiags] of fileMap) {
      const uri = vscode.Uri.file(path.join(flowDir, fileName));
      diagnosticCollection.set(uri, vsdiags);
    }
  }

  function scheduleDiagnostics(docUri: vscode.Uri) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runDiagnostics(docUri), 500);
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "flow") runDiagnostics(doc.uri);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "flow") runDiagnostics(doc.uri);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === "flow") scheduleDiagnostics(e.document.uri);
    }),
  );

  // Run diagnostics on activation for any already-open flow files
  runDiagnostics();

  // -- Format Provider ------------------------------------------------------
  const formatProvider = vscode.languages.registerDocumentFormattingEditProvider("flow", {
    provideDocumentFormattingEdits(document) {
      const text = document.getText();
      const formatted = formatFlowSource(text);
      if (text === formatted) return [];

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length),
      );
      return [vscode.TextEdit.replace(fullRange, formatted)];
    },
  });
  context.subscriptions.push(formatProvider);
}

export function deactivate() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFlowDir(docUri?: vscode.Uri): string | null {
  if (docUri) {
    const dir = path.dirname(docUri.fsPath);
    if (path.basename(dir) === "flow") {
      return dir;
    }
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;

  for (const folder of folders) {
    // If the workspace root itself is the flow dir
    if (path.basename(folder.uri.fsPath) === "flow") {
      return folder.uri.fsPath;
    }
    const flowDir = path.join(folder.uri.fsPath, "flow");
    if (fs.existsSync(flowDir)) return flowDir;
  }
  return null;
}

function readWorkspaceFlowSources(docUri?: vscode.Uri): Record<string, string> | null {
  const flowDir = findFlowDir(docUri);
  if (!flowDir) return null;

  const sources: Record<string, string> = {};
  try {
    const files = fs.readdirSync(flowDir).filter((f) => f.endsWith(".flow"));
    for (const file of files) {
      sources[file] = fs.readFileSync(path.join(flowDir, file), "utf-8");
    }
  } catch {
    return null;
  }

  return Object.keys(sources).length > 0 ? sources : null;
}

function parseWorkspaceFlowFiles(docUri?: vscode.Uri): ProjectAST | null {
  const sources = readWorkspaceFlowSources(docUri);
  if (!sources) return null;

  let appNode: AppNode | undefined;
  let entities: EntityNode[] = [];
  let actions: ActionNode[] = [];
  let workflows: WorkflowNode[] = [];
  let auth: AuthAST = { permissions: [], confirmations: [], rateLimits: [] };

  for (const [fileName, source] of Object.entries(sources)) {
    try {
      const parser = new Parser(source, fileName);
      const result = parser.detectAndParse();

      switch (result.type) {
        case "app":
          appNode = result.node;
          break;
        case "schema":
          entities = entities.concat(result.nodes);
          break;
        case "actions":
          actions = actions.concat(result.nodes);
          break;
        case "workflows":
          workflows = workflows.concat(result.nodes);
          break;
        case "auth":
          auth = {
            permissions: [...auth.permissions, ...result.auth.permissions],
            confirmations: [...auth.confirmations, ...result.auth.confirmations],
            rateLimits: [...auth.rateLimits, ...result.auth.rateLimits],
          };
          break;
      }
    } catch {
      // If a single file fails to parse, skip it
      continue;
    }
  }

  if (!appNode) return null;

  return { app: appNode, entities, actions, workflows, auth };
}
