// ============================================================================
// packages/cli/init.ts — axl init (interactive project scaffolding)
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import prompts from "prompts";
import * as ui from "./ui.js";
import { c, icons, Spinner } from "./ui.js";
import { writeConfig, type AxlConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function appTemplate(name: string, framework: string, language: string, database: string): string {
  return `-- app.flow
-- AXL Application Definition

APP ${name}

NAME "${name}"

VERSION 1.0.0

DESCRIPTION "An AXL-powered application"

FRAMEWORK ${framework}

LANGUAGE ${language}

DATABASE ${database}

BASE_URL http://localhost:3000/api

GENERATORS
  MCP
  OPENAPI
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
  ui.logo();

  const root = path.resolve(targetDir);
  const defaultName = path.basename(root);
  let projectName = defaultName;
  let framework = "Express";
  let language = "TypeScript";
  let database = "PostgreSQL";
  let flowTemplate = "Starter";
  let initGitRepo = false;

  if (!skipPrompts) {
    const response = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'Project Name',
        initial: defaultName
      },
      {
        type: 'select',
        name: 'framework',
        message: 'Framework',
        choices: [
          { title: 'Spring Boot', value: 'SpringBoot' },
          { title: 'Express', value: 'Express' },
          { title: 'NestJS', value: 'NestJS' },
          { title: 'FastAPI', value: 'FastAPI' },
          { title: 'Django', value: 'Django' }
        ]
      },
      {
        type: prev => prev === 'SpringBoot' ? 'select' : null,
        name: 'javaVersion',
        message: 'Java Version',
        choices: [
          { title: '21 LTS', value: 'Java' },
          { title: '17 LTS', value: 'Java' }
        ]
      },
      {
        type: (prev, values) => (values.framework === 'Express' || values.framework === 'NestJS') ? 'select' : null,
        name: 'language',
        message: 'Language',
        choices: [
          { title: 'TypeScript', value: 'TypeScript' },
          { title: 'JavaScript', value: 'JavaScript' }
        ]
      },
      {
        type: 'select',
        name: 'database',
        message: 'Database',
        choices: [
          { title: 'PostgreSQL', value: 'PostgreSQL' },
          { title: 'MySQL', value: 'MySQL' },
          { title: 'MongoDB', value: 'MongoDB' },
          { title: 'SQLite', value: 'SQLite' }
        ]
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
        ui.error("Initialization cancelled.");
        process.exit(1);
      }
    });

    projectName = response.projectName;
    framework = response.framework;
    if (framework === 'SpringBoot') {
      language = 'Java';
    } else if (framework === 'FastAPI' || framework === 'Django') {
      language = 'Python';
    } else {
      language = response.language || 'TypeScript';
    }
    database = response.database;
    flowTemplate = response.flowTemplate;
    initGitRepo = response.initGitRepo || false;
  }

  try {
    ui.blank();
    const spinner = new Spinner();
    spinner.start("Creating project...");

    const flowDir = path.join(root, "flow");
    const buildDir = path.join(root, "build");
    const generatedDir = path.join(root, "generated");

    // Give the spinner some time to show
    await new Promise(r => setTimeout(r, 400));

    // Create directories
    fs.mkdirSync(flowDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true });

    // Write .flow files
    if (flowTemplate === 'Starter') {
      writeIfNew(path.join(flowDir, "app.flow"), appTemplate(projectName, framework, language, database));
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

    // Write axl.config.json
    const config: AxlConfig = {
      name: projectName,
      flowDir: "./flow",
      outDir: "./build",
      generatedDir: "./generated",
    };
    writeConfig(root, config);

    // VS Code
    let vsCodeMsg = "";
    if (checkVSCode()) {
      const vscodeDir = path.join(root, ".vscode");
      fs.mkdirSync(vscodeDir, { recursive: true });
      writeIfNew(path.join(vscodeDir, "settings.json"), VSCODE_SETTINGS);
      vsCodeMsg = "AXL VS Code extension is not yet published.";
    }

    // .gitignore
    const gitignorePath = path.join(root, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, "utf-8");
      if (!existing.includes("# AXL")) {
        fs.appendFileSync(gitignorePath, GITIGNORE_ADDITIONS, "utf-8");
      }
    } else {
      fs.writeFileSync(gitignorePath, GITIGNORE_ADDITIONS.trim() + "\n", "utf-8");
    }

    if (initGitRepo) {
      initGit(root);
    }

    spinner.stop(`Project "${projectName}" created successfully.\n`);

    ui.blank();
    console.log(`  ${c.dim}Created${c.reset}`);
    ui.blank();
    console.log(`  ${c.green}${icons.success}${c.reset} app.flow`);
    console.log(`  ${c.green}${icons.success}${c.reset} schema.flow`);
    console.log(`  ${c.green}${icons.success}${c.reset} actions.flow`);
    console.log(`  ${c.green}${icons.success}${c.reset} workflows.flow`);
    console.log(`  ${c.green}${icons.success}${c.reset} auth.flow`);
    console.log(`  ${c.green}${icons.success}${c.reset} axl.config.json`);
    
    if (initGitRepo) {
      console.log(`  ${c.green}${icons.success}${c.reset} .git/`);
    }

    ui.blank();
    console.log(`  ${c.dim}Location${c.reset}`);
    ui.blank();
    console.log(`  ${root}`);
    ui.blank();

    if (vsCodeMsg) {
      ui.warn(vsCodeMsg);
      ui.blank();
    }

    console.log(`  ${c.dim}Next steps${c.reset}`);
    ui.blank();
    if (root !== process.cwd()) {
      const relPath = path.relative(process.cwd(), root);
      console.log(`    cd ${relPath}`);
      ui.blank();
    }
    console.log("    axl validate");
    console.log("    axl compile");
    console.log("    axl generate");
    ui.blank();
    console.log(`  Ready to build AI-native applications.`);
    ui.blank();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
