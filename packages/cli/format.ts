// ============================================================================
// packages/cli/format.ts — axl format
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { c, section, blank, success, env } from "./ui.js";

export function formatFlowSource(code: string): string {
  const lines = code.split(/\r?\n/);
  const formatted: string[] = [];
  
  let indent = 0;
  let inBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.trim();
    
    if (line.length === 0) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== "") {
        formatted.push("");
      }
      continue;
    }
    
    if (line.includes("}")) {
      indent = Math.max(0, indent - 1);
    }
    
    // Some lines might just be closing braces, keep them at current indent
    let spaces = "  ".repeat(indent);
    
    // Basic fix for attributes starting with @
    if (line.startsWith("@")) {
      formatted.push(spaces + line);
    } else {
      formatted.push(spaces + line);
    }
    
    if (line.includes("{")) {
      indent++;
    }
  }
  
  // Ensure trailing newline
  let result = formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result + "\n";
}

export async function format(flowDir: string): Promise<void> {
  if (!env.isQuiet) {
    section("Formatting Flow Files");
  }

  if (!fs.existsSync(flowDir)) {
    if (!env.isQuiet) {
      console.log(`  ${c.error("✖")} Directory not found: ${flowDir}`);
      blank();
    }
    process.exit(1);
  }

  const files = fs.readdirSync(flowDir).filter(f => f.endsWith(".flow"));
  let formattedCount = 0;

  for (const file of files) {
    const filePath = path.join(flowDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    
    const formatted = formatFlowSource(content);
    if (content !== formatted) {
      fs.writeFileSync(filePath, formatted, "utf-8");
      formattedCount++;
    }
  }

  if (!env.isQuiet) {
    success(`Formatted ${formattedCount} of ${files.length} files.`);
    blank();
  }
}
