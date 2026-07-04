import type { Manifest } from "@axl/compiler";
import type { Generator, GeneratedFile } from "./types.js";

export class McpGenerator implements Generator {
  id = "MCP";
  description = "Generates a Model Context Protocol (MCP) server for the application";

  async generate(manifest: Manifest): Promise<GeneratedFile[]> {
    // A mock generation for now, just to prove the pipeline works
    const code = `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Generated MCP server for ${manifest.app.name} v${manifest.app.version}
// Base URL: ${manifest.app.base_url}

const server = new Server({
  name: "${manifest.app.name.toLowerCase()}-mcp",
  version: "${manifest.app.version}"
}, {
  capabilities: {
    tools: {}
  }
});

// ... tool handlers for actions would go here ...

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MCP Server running on stdio");
}

main().catch(console.error);
    `.trim();

    return [
      {
        path: "mcp/index.ts",
        content: code
      },
      {
        path: "mcp/package.json",
        content: JSON.stringify({
          name: `${manifest.app.name.toLowerCase()}-mcp`,
          version: manifest.app.version,
          type: "module",
          dependencies: {
            "@modelcontextprotocol/sdk": "^1.2.0"
          }
        }, null, 2)
      }
    ];
  }
}
