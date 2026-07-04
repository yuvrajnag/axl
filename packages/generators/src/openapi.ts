import type { Manifest } from "@axl/compiler";
import type { Generator, GeneratedFile } from "./types.js";

export class OpenApiGenerator implements Generator {
  id = "OPENAPI";
  description = "Generates an OpenAPI 3.0 specification optimized for LLM consumption";

  async generate(manifest: Manifest): Promise<GeneratedFile[]> {
    // Very basic mock output to prove pipeline
    const yaml = `
openapi: 3.0.0
info:
  title: ${manifest.app.displayName || manifest.app.name}
  version: ${manifest.app.version}
  description: ${manifest.app.description}
servers:
  - url: ${manifest.app.base_url}
paths:
  # Paths generated from AXL actions
components:
  schemas:
    # Schemas generated from AXL entities
    `.trim();

    return [
      {
        path: "openapi/openapi.yaml",
        content: yaml
      }
    ];
  }
}
