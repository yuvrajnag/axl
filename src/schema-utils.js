import { z } from "zod";

/**
 * Converts a .flow input spec like:
 *   { title: { type: string, required: true }, due_date: { type: string, required: false } }
 * into a Zod raw shape.
 */
export function buildZodShape(inputSpec) {
  const shape = {};
  for (const [key, def] of Object.entries(inputSpec || {})) {
    let field;
    switch (def.type) {
      case "number": field = z.number(); break;
      case "boolean": field = z.boolean(); break;
      default: field = z.string();
    }
    if (!def.required) field = field.optional();
    shape[key] = field;
  }
  return shape;
}
