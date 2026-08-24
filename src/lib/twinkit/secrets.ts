/**
 * Patterns used by twin-pack secret scan (keep in sync with scripts.ts).
 * Exported for unit tests.
 */
export const SECRET_SCAN_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{12,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /Bearer [A-Za-z0-9._-]{20,}/,
];

export function scanTextForSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const re of SECRET_SCAN_PATTERNS) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = global.exec(text)) !== null) {
      hits.push(m[0].slice(0, 24) + (m[0].length > 24 ? "…" : ""));
      if (hits.length >= 50) return hits;
    }
  }
  return hits;
}
