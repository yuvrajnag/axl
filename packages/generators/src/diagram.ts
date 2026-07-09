import type { Manifest, ManifestAction } from "@axl/compiler";
import type { Generator, GeneratedFile } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitise a string for use as a Mermaid node id.
 * Strips non-alphanumeric chars and collapses to camelCase-ish tokens.
 */
function nodeId(prefix: string, name: string): string {
  return `${prefix}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Build a Mermaid node definition whose shape encodes the action's gate level:
 *   PUBLIC  → plain rectangle   [label]
 *   AUTH    → subroutine        [[label]]
 *   OTP     → hexagon           {{label}}
 *   unknown → stadium (rounded) ([label (undefined action!)])
 */
function actionNode(
  id: string,
  stepName: string,
  action: ManifestAction | undefined,
): string {
  if (!action) {
    return `${id}(["${stepName} (undefined action!)"])`;
  }
  if (action.confirm === "OTP") {
    return `${id}{{"${stepName} [OTP]"}}`;
  }
  if (action.permission === "AUTH") {
    return `${id}[["${stepName} [AUTH]"]]`;
  }
  // PUBLIC (default)
  return `${id}["${stepName}"]`;
}

// ---------------------------------------------------------------------------
// Flowchart generation
// ---------------------------------------------------------------------------

function generateFlowchart(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push("flowchart TD");

  // Legend subgraph
  lines.push("");
  lines.push("  subgraph Legend");
  lines.push('    legend_pub["PUBLIC action"]');
  lines.push('    legend_auth[["AUTH action"]]');
  lines.push('    legend_otp{{"OTP confirm"}}');
  lines.push('    legend_undef(["Undefined action!"])');
  lines.push("  end");

  // One subgraph per workflow
  for (const workflow of manifest.workflows) {
    lines.push("");
    lines.push(`  subgraph ${nodeId("wf", workflow.name)}["${workflow.name}"]`);

    const stepIds: string[] = [];

    for (let i = 0; i < workflow.steps.length; i++) {
      const stepName = workflow.steps[i];
      const id = nodeId("step", `${workflow.name}_${stepName}_${i}`);
      stepIds.push(id);

      const action = manifest.actions[stepName];
      lines.push(`    ${actionNode(id, stepName, action)}`);
    }

    // Directional edges between consecutive steps
    for (let i = 0; i < stepIds.length - 1; i++) {
      lines.push(`    ${stepIds[i]} --> ${stepIds[i + 1]}`);
    }

    lines.push("  end");
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// ER diagram generation
// ---------------------------------------------------------------------------

/**
 * Extract the inner type name from a type string.
 * "List<Product>" → { inner: "Product", isList: true }
 * "Product"       → { inner: "Product", isList: false }
 */
function parseFieldType(type: string): { inner: string; isList: boolean } {
  const listMatch = type.match(/^List<(.+)>$/);
  if (listMatch) {
    return { inner: listMatch[1], isList: true };
  }
  return { inner: type, isList: false };
}

function generateErDiagram(manifest: Manifest): string {
  const entityNames = new Set(manifest.entities.map((e) => e.name));
  const lines: string[] = [];
  lines.push("erDiagram");

  // Track emitted relation pairs to avoid duplicates
  const emittedRelations = new Set<string>();

  for (const entity of manifest.entities) {
    lines.push("");
    lines.push(`  ${entity.name} {`);
    for (const field of entity.fields) {
      const requiredMark = field.required ? "PK" : "";
      // Mermaid erDiagram doesn't support <> in type names.
      // Replace List<Room> → List~Room~ (Mermaid generic notation).
      const safeType = field.type.replace(/</g, "~").replace(/>/g, "~");
      lines.push(
        `    ${safeType} ${field.name}${requiredMark ? " " + requiredMark : ""}`,
      );
    }
    lines.push("  }");

    // Infer relations from field types
    for (const field of entity.fields) {
      const { inner, isList } = parseFieldType(field.type);
      if (entityNames.has(inner) && inner !== entity.name) {
        // Deduplicate: normalise to alphabetical pair
        const pair = [entity.name, inner].sort().join("::");
        if (!emittedRelations.has(pair)) {
          emittedRelations.add(pair);
          if (isList) {
            // one-to-many
            lines.push(`  ${entity.name} ||--o{ ${inner} : "${field.name}"`);
          } else {
            // one-to-one (or many-to-one from this side)
            lines.push(`  ${entity.name} }o--|| ${inner} : "${field.name}"`);
          }
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generator class
// ---------------------------------------------------------------------------

export class DiagramGenerator implements Generator {
  id = "DIAGRAM";
  description =
    "Generates Mermaid workflow flowchart and entity-relationship diagrams";

  async generate(manifest: Manifest): Promise<GeneratedFile[]> {
    return [
      {
        path: "docs/system-flow.mmd",
        content: generateFlowchart(manifest),
      },
      {
        path: "docs/schema.mmd",
        content: generateErDiagram(manifest),
      },
    ];
  }
}
