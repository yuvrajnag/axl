// ============================================================================
// packages/cli/init.ts — axl init (interactive project scaffolding)
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import prompts from "prompts";
import { c, icons, brand, section, stepList, blank, errorMsg, warn } from "./ui.js";
import { writeConfig, type AxlConfig } from "./config.js";

// Override prompts symbols to match AXL theme exactly
import * as nodeModule from "node:module";
const _require = nodeModule.createRequire(import.meta.url);
const promptsStyle = _require("prompts/lib/util/style.js");
promptsStyle.symbol = (done: boolean, aborted: boolean) => {
  if (aborted) return `  ${c.error(icons.error)}`;
  if (done) return `  ${c.success(icons.success)}`;
  return `  ${c.accent(icons.arrow)}`;
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function appTemplate(name: string): string {
  return `-- app.flow
-- AXL Application Definition

APP ${name}

NAME "${name}"

VERSION 1.0.0

DESCRIPTION "An AXL-powered application"

BASE_URL http://localhost:3000/api

GENERATORS
  DIAGRAM
`;
}

const SCHEMA_TEMPLATE = `-- schema.flow
-- Entity Definitions

ENTITY User

  id       : String
  name     : String
  email    : String
`;

const ACTIONS_TEMPLATE = `-- actions.flow
-- Action Definitions

ACTION list_users

  DESC "List all users"

  OUTPUT List<User>

  ENDPOINT GET /users

ACTION create_user

  DESC "Create a new user"

  INPUT
    name  : String REQUIRED
    email : String REQUIRED

  OUTPUT User

  ENDPOINT POST /users
`;

const WORKFLOWS_TEMPLATE = `-- workflows.flow
-- Workflow Definitions

WORKFLOW UserOnboarding

  STEP create_user

END
`;

const AUTH_TEMPLATE = `-- auth.flow
-- Permission and Security Rules

PERMISSION list_users : PUBLIC
PERMISSION create_user : AUTH
`;

const AGENT_TEMPLATE = `# AXL Agent Guide
AXL is an AI-native application specification language that compiles to an MCP (Model Context Protocol) server. AXL allows you to define workflows, entities, actions, and permissions declaratively.

## Project Structure
- \`app.flow\`: Top-level app definition (name, version, baseUrl, generators).
- \`schema.flow\`: Entity and relationship definitions.
- \`actions.flow\`: Action signatures and REST endpoint mappings.
- \`workflows.flow\`: Orchestrated sequences of actions with data binding.
- \`auth.flow\`: Security rules and confirm gates (OTP) for actions.

## CRITICAL: Case-Sensitivity
AXL keywords are strictly case-sensitive and **must be UPPERCASE**.
Keywords: \`APP\`, \`ENTITY\`, \`ACTION\`, \`WORKFLOW\`, \`STEP\`, \`INPUT\`, \`OUTPUT\`, \`ENDPOINT\`, \`PERMISSION\`, \`CONFIRM\`, \`RATE_LIMIT\`, \`USING\`, \`IF\`, \`ELSE\`, \`END\`.
If you use lowercase (e.g. \`app\`, \`entity\`), you will get compilation errors.

## Data Binding
Workflow steps MUST explicitly declare data dependencies using the \`USING\` clause. Missing required inputs will cause a compile error.
Syntax: \`STEP <target_action> USING <target_input_field> = <source_step_name>.<source_output_field>\`

Example:
\`\`\`flow
WORKFLOW TaskLifecycle
  STEP create_task
  STEP update_task_status USING task_id = create_task.id
\`\`\`

## Commands
1. \`axl compile\`: Compiles \`flow/\` into \`build/manifest.json\`. Run this often to get compiler errors immediately!
2. \`axl generate\`: Runs generators (like DIAGRAM) based on the manifest.
3. \`axl doctor\`: Diagnostic checks for the environment and project.
`;

const GITIGNORE_ADDITIONS = `
# AXL
build/
generated/
node_modules/
*.log
`;

const VSCODE_SETTINGS = `{
  "files.associations": {
    "*.flow": "axl"
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeIfNew(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function initGit(dir: string): void {
  try {
    execSync("git init", { cwd: dir, stdio: "ignore" });
  } catch {}
}

function checkVSCode(): boolean {
  if (process.env.AXL_MOCK_VSCODE === "true") return true;
  if (process.env.AXL_MOCK_VSCODE === "false") return false;
  try {
    execSync("code --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

export async function init(targetDir: string, skipPrompts = false): Promise<void> {
  brand();
  section("Create New Project");

  const root = path.resolve(targetDir);
  const defaultName = path.basename(root);
  let projectName = defaultName;
  let flowTemplate = "Starter";
  let initGitRepo = false;

  if (!skipPrompts) {
    // Override prompts theme
    prompts.override({}); // Reset any existing overrides

    const response = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'Project Name',
        initial: defaultName
      },
      {
        type: 'select',
        name: 'flowTemplate',
        message: 'Flow Template',
        choices: [
          { title: 'Starter', value: 'Starter' },
          { title: 'Empty', value: 'Empty' }
        ]
      },
      {
        type: () => (hasGit() && !isGitRepo(root)) ? 'confirm' : null,
        name: 'initGitRepo',
        message: 'Initialize Git repository?',
        initial: true
      }
    ], {
      onCancel: () => {
        blank();
        errorMsg("Initialization cancelled.");
        process.exit(1);
      }
    });

    projectName = response.projectName;
    flowTemplate = response.flowTemplate;
    initGitRepo = response.initGitRepo || false;
  }

  try {
    blank();
    const stepsArr = [
      "Creating directories",
      "Generating Flow files",
      "Writing configuration",
      "Preparing workspace"
    ];
    if (initGitRepo) stepsArr.push("Initializing Git");

    const steps = stepList(stepsArr);

    let idx = 0;
    
    // Creating directories
    steps.update(idx, "active");
    const flowDir = path.join(root, "flow");
    const buildDir = path.join(root, "build");
    const generatedDir = path.join(root, "generated");
    fs.mkdirSync(flowDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true });
    steps.update(idx++, "done");

    // Generating Flow files
    steps.update(idx, "active");
    if (flowTemplate === 'Starter') {
      writeIfNew(path.join(flowDir, "app.flow"), appTemplate(projectName));
      writeIfNew(path.join(flowDir, "schema.flow"), SCHEMA_TEMPLATE);
      writeIfNew(path.join(flowDir, "actions.flow"), ACTIONS_TEMPLATE);
      writeIfNew(path.join(flowDir, "workflows.flow"), WORKFLOWS_TEMPLATE);
      writeIfNew(path.join(flowDir, "auth.flow"), AUTH_TEMPLATE);
    } else {
      writeIfNew(path.join(flowDir, "app.flow"), "");
      writeIfNew(path.join(flowDir, "schema.flow"), "");
      writeIfNew(path.join(flowDir, "actions.flow"), "");
      writeIfNew(path.join(flowDir, "workflows.flow"), "");
      writeIfNew(path.join(flowDir, "auth.flow"), "");
    }
    steps.update(idx++, "done");

    // Writing configuration
    steps.update(idx, "active");
    const config: AxlConfig = {
      name: projectName,
      flowDir: "./flow",
      outDir: "./build",
      generatedDir: "./generated",
    };
    writeConfig(root, config);

    const agentPath = path.join(root, "AGENT.md");
    writeIfNew(agentPath, AGENT_TEMPLATE);

    steps.update(idx++, "done");

    // Preparing workspace
    steps.update(idx, "active");
    let vsCodeMsg = "";
    if (checkVSCode()) {
      const vscodeDir = path.join(root, ".vscode");
      fs.mkdirSync(vscodeDir, { recursive: true });
      writeIfNew(path.join(vscodeDir, "settings.json"), VSCODE_SETTINGS);
      vsCodeMsg = "AXL VS Code extension is not yet published.";
    }

    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, "utf-8");
      if (!existing.includes("# AXL")) {
        fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, "utf-8");
      }
    } else {
      fs.writeFileSync(gitignorePath, GITIGNORE_ADDITIONS.trim() + "\n", "utf-8");
    }
    steps.update(idx++, "done");

    if (initGitRepo) {
      steps.update(idx, "active");
      initGit(root);
      steps.update(idx++, "done");
    }
    
    steps.stop();

    blank();
    console.log(`  ${c.success(icons.success)} ${c.primary("Project created")}  ${c.secondary("→")}  ${c.plain(projectName + "/")}`);
    blank();
    console.log(`  ${c.primary("Next steps")}`);
    blank();

    const nextSteps = [];
    if (root !== process.cwd()) {
      nextSteps.push(`cd ${path.relative(process.cwd(), root) || projectName}`);
    }
    nextSteps.push("axl doctor");
    nextSteps.push("axl compile");

    for (const step of nextSteps) {
      console.log(`  ${c.accent(icons.arrow)} ${c.plain(step)}`);
    }
    if (vsCodeMsg) {
      blank();
      warn(vsCodeMsg);
    }
    blank();

  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
