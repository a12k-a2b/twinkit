import type { ManifestSummary, ManifestTool, ParityReport, ParityResult, ParityStatus } from "./types";

/** Rough install hints when MANIFEST says a tool was present on the primary Mac. */
const INSTALL_HINTS: Record<string, string> = {
  brew: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  git: "xcode-select --install  # or brew install git",
  node: "brew install node  # or fnm/nvm — match MANIFEST version if possible",
  npm: "comes with node",
  npx: "comes with node",
  java: "brew install --cask temurin@17  # match MANIFEST major",
  adb: "sdkmanager platform-tools  # or Android Studio",
  claude: "npm i -g @anthropic-ai/claude-code  # or official installer from docs",
  codex: "npm i -g @openai/codex  # or brew / official installer",
  grok: "install Grok Build CLI per xAI docs; restore PATH/skill wiring",
  muse: "install Muse Spark; pin version if skills assume 1.2.x",
  gh: "brew install gh && gh auth login",
  python3: "brew install python  # or xcode CLT python3",
  emulator: "Android SDK emulator package",
  sdkmanager: "Android command-line tools",
};

export function installHintFor(tool: string): string | undefined {
  return INSTALL_HINTS[tool.toLowerCase()];
}

export function parseParityJson(raw: unknown): ParityReport {
  if (!raw || typeof raw !== "object") throw new Error("PARITY.json must be an object");
  const o = raw as Record<string, unknown>;
  const results: ParityResult[] = [];
  if (Array.isArray(o.results)) {
    for (const r of o.results) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const status = normalizeStatus(row.status);
      const name = String(row.name ?? "unknown");
      const detail = String(row.detail ?? "");
      results.push({ status, name, detail });
    }
  }
  const pass =
    typeof o.pass === "number" ? o.pass : results.filter((r) => r.status === "pass").length;
  const warn =
    typeof o.warn === "number" ? o.warn : results.filter((r) => r.status === "warn").length;
  const fail =
    typeof o.fail === "number" ? o.fail : results.filter((r) => r.status === "fail").length;

  return {
    twinkit: typeof o.twinkit === "string" ? o.twinkit : undefined,
    generatedAt: typeof o.generatedAt === "string" ? o.generatedAt : undefined,
    pass,
    warn,
    fail,
    ok: typeof o.ok === "boolean" ? o.ok : fail === 0,
    results,
    source: "json",
  };
}

function normalizeStatus(s: unknown): ParityStatus {
  if (s === "pass" || s === "warn" || s === "fail" || s === "skip") return s;
  return "warn";
}

/** Parse twin-verify style markdown table rows as fallback */
export function parseParityMarkdown(text: string): ParityReport {
  const results: ParityResult[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(
      /^\|\s*(pass|warn|fail|skip)\s*\|\s*`?([^`|]+)`?\s*\|\s*(.*?)\s*\|$/i,
    );
    if (!m) continue;
    results.push({
      status: normalizeStatus(m[1]!.toLowerCase()),
      name: m[2]!.trim(),
      detail: m[3]!.trim(),
    });
  }
  const pass = results.filter((r) => r.status === "pass").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  return {
    pass,
    warn,
    fail,
    ok: fail === 0,
    results,
    source: "markdown",
  };
}

export function parseManifestMarkdown(text: string): ManifestSummary {
  const tools: ManifestTool[] = [];
  let host: string | undefined;
  let arch: string | undefined;
  let macos: string | undefined;
  let packedAt: string | undefined;

  for (const line of text.split("\n")) {
    const hostM = line.match(/^Host:\s*(.+)$/i);
    if (hostM) host = hostM[1]!.trim();
    const archM = line.match(/^Arch:\s*(.+)$/i);
    if (archM) arch = archM[1]!.trim();
    const macM = line.match(/^macOS:\s*(.+)$/i);
    if (macM) macos = macM[1]!.trim();
    const packM = line.match(/^Packed:\s*(.+)$/i);
    if (packM) packedAt = packM[1]!.trim();

    const toolM = line.match(/^- ([a-zA-Z0-9._-]+):\s*(.+)$/);
    if (toolM) {
      const name = toolM[1]!;
      const versionLine = toolM[2]!.trim();
      const presentOnPack = !/\(not found\)/i.test(versionLine);
      tools.push({
        name,
        versionLine,
        presentOnPack,
        installHint: presentOnPack ? installHintFor(name) : undefined,
      });
    }
  }

  return {
    host,
    arch,
    macos,
    packedAt,
    tools,
    rawPreview: text.slice(0, 400),
  };
}

export function parityTone(status: ParityStatus): "success" | "warn" | "danger" | "muted" {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warn";
    case "fail":
      return "danger";
    default:
      return "muted";
  }
}
