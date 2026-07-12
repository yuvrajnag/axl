import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadManifest } from "./manifest.js";
import { AxlEngine, PermissionError, BackendError } from "./engine.js";
import { buildZodShape } from "./schema-utils.js";

export function buildAxlServer(manifestPath, { sessionCookie, contextExtractor, engine } = {}) {
  const manifest = loadManifest(manifestPath);
  const actualEngine = engine || new AxlEngine(manifest);
  const server = new McpServer({
    name: `axl-${manifest.app.name.toLowerCase().replace(/\s+/g, "-")}`,
    version: manifest.axl_version || manifest.app.version || "1.0",
  });
  registerTools(server, manifest, actualEngine, sessionCookie, contextExtractor);
  return { server, engine: actualEngine, manifest };
}



function textResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function registerTools(server, manifest, engine, sessionCookie, contextExtractor) {
  // Register every action from actions.flow as an MCP tool.
  for (const [actionName, actionDef] of Object.entries(manifest.actions)) {
    server.registerTool(
      actionName,
      {
        title: actionName,
        description:
          actionDef.description +
          (actionDef.confirm ? " (requires human confirmation before executing)" : ""),
        inputSchema: buildZodShape(actionDef.input),
      },
      async (args) => {
        try {
          let context = { sessionCookie };
          if (contextExtractor) {
            context = { ...context, ...contextExtractor() };
          }
          const result = await engine.execute(actionName, args, context);
          return textResult(result);
        } catch (err) {
          if (err instanceof PermissionError) {
            return textResult({ error: "PERMISSION_DENIED", message: err.message });
          }
          if (err instanceof BackendError) {
            return textResult({ error: "BACKEND_ERROR", status: err.status, body: err.body });
          }
          return textResult({ error: "EXECUTION_ERROR", message: err.message });
        }
      }
    );
  }

  // One extra, always-present tool: the second phase of any OTP-gated action.
  server.registerTool(
    "confirm_action",
    {
      title: "confirm_action",
      description:
        "Confirms a pending action that required human approval. Requires the token " +
        "returned by the original action call, plus the OTP code.",
      inputSchema: {
        token: z.string(),
        otp: z.string(),
      },
    },
    async ({ token, otp }) => {
      try {
        const result = await engine.confirmAction(token, otp);
        return textResult(result);
      } catch (err) {
        return textResult({ error: "CONFIRMATION_FAILED", message: err.message });
      }
    }
  );

  if (manifest.workflows) {
    server.registerTool(
      "run_workflow",
      {
        title: "run_workflow",
        description: "Runs a workflow defined in the manifest.",
        inputSchema: {
          workflowName: z.string(),
          initialArgs: z.record(z.any()).optional().describe("Initial arguments for the workflow.")
        }
      },
      async ({ workflowName, initialArgs }) => {
        try {
          let context = { sessionCookie };
          if (contextExtractor) {
            context = { ...context, ...contextExtractor() };
          }
          const result = await engine.runWorkflow(workflowName, initialArgs || {}, context);
          return textResult(result);
        } catch (err) {
          if (err instanceof PermissionError) {
            return textResult({ error: "PERMISSION_DENIED", message: err.message });
          }
          if (err instanceof BackendError) {
            return textResult({ error: "BACKEND_ERROR", status: err.status, body: err.body });
          }
          return textResult({ error: "WORKFLOW_ERROR", message: err.message });
        }
      }
    );

    server.registerTool(
      "resume_workflow",
      {
        title: "resume_workflow",
        description: "Resumes a paused workflow.",
        inputSchema: {
          token: z.string(),
          otp: z.string()
        }
      },
      async ({ token, otp }) => {
        try {
          const result = await engine.resumeWorkflow(token, otp);
          return textResult(result);
        } catch (err) {
          return textResult({ error: "RESUME_FAILED", message: err.message });
        }
      }
    );
  }
}

export async function startAxlServer(manifestPath, opts = {}) {
  const { server, engine, manifest } = buildAxlServer(manifestPath, opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, engine, manifest };
}
