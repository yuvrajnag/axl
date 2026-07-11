// ============================================================================
// packages/vscode/src/hover.ts — Pure hover-info lookup (no VS Code deps)
// ============================================================================

import type { ProjectAST, ActionNode, EntityNode } from "@axl/compiler";

/**
 * Look up hover information for a word in the context of a parsed ProjectAST.
 * Returns a markdown string suitable for a tooltip, or null if no match.
 */
export function getHoverInfo(word: string, ast: ProjectAST): string | null {
  // Check actions
  const action = ast.actions.find(a => a.name === word);
  if (action) {
    return formatActionHover(action, ast);
  }

  // Check entities
  const entity = ast.entities.find(e => e.name === word);
  if (entity) {
    return formatEntityHover(entity);
  }

  return null;
}

function formatActionHover(action: ActionNode, ast: ProjectAST): string {
  const lines: string[] = [];

  lines.push(`**ACTION** \`${action.name}\``);
  lines.push("");

  if (action.description) {
    lines.push(`${action.description}`);
    lines.push("");
  }

  if (action.inputs.length > 0) {
    lines.push("**INPUT**");
    for (const input of action.inputs) {
      const req = input.required ? "REQUIRED" : "OPTIONAL";
      lines.push(`- \`${input.name}\` : \`${formatTypeRef(input.type)}\` ${req}`);
    }
    lines.push("");
  }

  lines.push(`**OUTPUT** \`${formatTypeRef(action.output)}\``);
  lines.push("");

  if (action.endpoint) {
    lines.push(`**ENDPOINT** \`${action.endpoint.method} ${action.endpoint.path}\``);
    lines.push("");
  }

  // Check auth.flow for permission/confirm on this action
  const perm = ast.auth.permissions.find(p => p.actionRef === action.name);
  if (perm) {
    lines.push(`**PERMISSION** \`${perm.level}\``);
  }

  const confirm = ast.auth.confirmations.find(c => c.actionRef === action.name);
  if (confirm) {
    lines.push(`**CONFIRM** \`${confirm.method}\``);
  }

  const rateLimit = ast.auth.rateLimits.find(r => r.actionRef === action.name);
  if (rateLimit) {
    lines.push(`**RATE_LIMIT** \`${rateLimit.limit}\``);
  }

  return lines.join("\n").trim();
}

function formatEntityHover(entity: EntityNode): string {
  const lines: string[] = [];

  lines.push(`**ENTITY** \`${entity.name}\``);
  lines.push("");

  if (entity.fields.length > 0) {
    lines.push("**Fields**");
    for (const field of entity.fields) {
      lines.push(`- \`${field.name}\` : \`${formatTypeRef(field.type)}\``);
    }
  }

  return lines.join("\n").trim();
}

function formatTypeRef(type: { name: string; typeArgument?: { name: string } }): string {
  if (type.typeArgument) {
    return `${type.name}<${type.typeArgument.name}>`;
  }
  return type.name;
}
