// ============================================================================
// packages/cli/ui.ts — Terminal UI primitives
// ============================================================================
// Beautiful, cross-platform terminal output utilities.
// All visual formatting flows through this module so the CLI has
// a consistent, polished look everywhere.
// ============================================================================

// ---------------------------------------------------------------------------
// ANSI color codes — works on all modern terminals including Windows Terminal,
// PowerShell 7, macOS Terminal, iTerm2, and all Linux terminals.
// ---------------------------------------------------------------------------

const isColorSupported =
  process.env["NO_COLOR"] === undefined &&
  process.env["TERM"] !== "dumb" &&
  (process.stdout.isTTY ?? false);

function ansi(code: string): string {
  return isColorSupported ? code : "";
}

export const c = {
  reset:     ansi("\x1b[0m"),
  bold:      ansi("\x1b[1m"),
  dim:       ansi("\x1b[2m"),
  italic:    ansi("\x1b[3m"),
  underline: ansi("\x1b[4m"),
  // Foreground
  red:       ansi("\x1b[31m"),
  green:     ansi("\x1b[32m"),
  yellow:    ansi("\x1b[33m"),
  blue:      ansi("\x1b[34m"),
  magenta:   ansi("\x1b[35m"),
  cyan:      ansi("\x1b[36m"),
  white:     ansi("\x1b[37m"),
  gray:      ansi("\x1b[90m"),
  // Bright
  brightGreen:  ansi("\x1b[92m"),
  brightYellow: ansi("\x1b[93m"),
  brightCyan:   ansi("\x1b[96m"),
  brightWhite:  ansi("\x1b[97m"),
} as const;

// ---------------------------------------------------------------------------
// Unicode icons — degrades gracefully on terminals that don't support them
// ---------------------------------------------------------------------------

export const icons = {
  success:  "✔",
  error:    "✖",
  warning:  "⚠",
  info:     "●",
  arrow:    "→",
  bullet:   "•",
  line:     "─",
  rocket:   "🚀",
  sparkle:  "✨",
  folder:   "📁",
  file:     "📄",
  gear:     "⚙",
  check:    "✓",
  cross:    "✗",
  dot:      "·",
} as const;

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function logo(): void {
  const ascii = `
    █████╗ ██╗  ██╗██╗
   ██╔══██╗╚██╗██╔╝██║
   ███████║ ╚███╔╝ ██║
   ██╔══██║ ██╔██╗ ██║
   ██║  ██║██╔╝ ██╗███████╗
  `;
  console.log(`\n${c.brightCyan}${ascii}${c.reset}`);
  console.log(`  ${c.bold}AXL v0.1.0${c.reset}`);
  console.log(`  ${c.dim}AI-Native Application Specification Language${c.reset}\n`);
}

export function banner(title: string, subtitle?: string): void {
  const width = 50;
  const line = icons.line.repeat(width);
  console.log("");
  console.log(`  ${c.brightCyan}${c.bold}${title}${c.reset}`);
  console.log(`  ${c.dim}${line}${c.reset}`);
  if (subtitle) {
    console.log(`  ${c.dim}${subtitle}${c.reset}`);
  }
}

export function success(message: string): void {
  console.log(`  ${c.green}${icons.success}${c.reset} ${message}`);
}

export function error(message: string): void {
  console.log(`  ${c.red}${icons.error}${c.reset} ${message}`);
}

export function warn(message: string): void {
  console.log(`  ${c.yellow}${icons.warning}${c.reset} ${message}`);
}

export function info(message: string): void {
  console.log(`  ${c.blue}${icons.info}${c.reset} ${message}`);
}

export function step(label: string, detail?: string): void {
  const suffix = detail ? ` ${c.dim}${detail}${c.reset}` : "";
  console.log(`  ${c.green}${icons.success}${c.reset} ${label}${suffix}`);
}

export function dim(message: string): void {
  console.log(`  ${c.dim}${message}${c.reset}`);
}

export function blank(): void {
  console.log("");
}

export function label(key: string, value: string): void {
  console.log(`  ${c.dim}${key}:${c.reset} ${value}`);
}

export function heading(text: string): void {
  console.log(`  ${c.bold}${text}${c.reset}`);
}

export function suggestion(title: string, lines: string[]): void {
  console.log("");
  console.log(`  ${c.yellow}${icons.warning} ${title}${c.reset}`);
  for (const line of lines) {
    console.log(`    ${c.dim}${line}${c.reset}`);
  }
}

export function table(rows: Array<{ label: string; status: "pass" | "fail" | "warn"; detail: string }>): void {
  const maxLabel = Math.max(...rows.map(r => r.label.length));
  for (const row of rows) {
    const icon = row.status === "pass"
      ? `${c.green}${icons.success}${c.reset}`
      : row.status === "warn"
        ? `${c.yellow}${icons.warning}${c.reset}`
        : `${c.red}${icons.cross}${c.reset}`;
    const paddedLabel = row.label.padEnd(maxLabel);
    console.log(`  ${icon} ${c.bold}${paddedLabel}${c.reset}  ${c.dim}${row.detail}${c.reset}`);
  }
}

// ---------------------------------------------------------------------------
// Error box — for fatal errors
// ---------------------------------------------------------------------------

export function errorBox(title: string, body: string[], fix?: string[]): void {
  console.log("");
  console.log(`  ${c.red}${c.bold}${icons.error} ${title}${c.reset}`);
  console.log("");
  for (const line of body) {
    console.log(`  ${line}`);
  }
  if (fix && fix.length > 0) {
    console.log("");
    console.log(`  ${c.dim}Suggestion:${c.reset}`);
    for (const f of fix) {
      console.log(`    ${c.cyan}${f}${c.reset}`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Progress simulation (for fast operations that complete instantly)
// ---------------------------------------------------------------------------

export function pipeline(steps: Array<{ label: string; ok: boolean; detail?: string }>): void {
  for (const s of steps) {
    if (s.ok) {
      const suffix = s.detail ? ` ${c.dim}${s.detail}${c.reset}` : "";
      console.log(`  ${c.green}${icons.success}${c.reset} ${s.label}${suffix}`);
    } else {
      const suffix = s.detail ? ` ${c.dim}${s.detail}${c.reset}` : "";
      console.log(`  ${c.red}${icons.cross}${c.reset} ${s.label}${suffix}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Spinner (zero dependencies)
// ---------------------------------------------------------------------------

export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private i = 0;
  private timer: NodeJS.Timeout | null = null;
  private message = "";

  start(msg: string) {
    this.message = msg;
    if (this.timer) clearInterval(this.timer);
    
    // Initial draw
    process.stdout.write(`  ${c.cyan}${this.frames[0]}${c.reset} ${this.message}`);
    
    this.timer = setInterval(() => {
      this.i = (this.i + 1) % this.frames.length;
      process.stdout.write(`\r  ${c.cyan}${this.frames[this.i]}${c.reset} ${this.message}`);
    }, 80);
  }

  update(msg: string) {
    this.message = msg;
    process.stdout.write(`\r  ${c.cyan}${this.frames[this.i]}${c.reset} ${this.message}\x1b[K`);
  }

  stop(msg?: string, success = true) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    
    // Clear line
    process.stdout.write("\r\x1b[K");
    
    if (msg) {
      const icon = success ? `${c.green}${icons.success}${c.reset}` : `${c.red}${icons.cross}${c.reset}`;
      console.log(`  ${icon} ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fuzzy suggestion ("Did you mean X?")
// ---------------------------------------------------------------------------

export function didYouMean(input: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const score = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore && score <= 3) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}
