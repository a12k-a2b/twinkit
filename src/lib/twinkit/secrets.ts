/**
 * Patterns used by twin-pack secret scan (keep in sync with public/twinkit/twin-pack.sh).
 * Hits must never be stored as matched text — path:line:id only.
 */
export const SECRET_SCAN_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "openai-sk", re: /sk-[A-Za-z0-9_-]{12,}/ },
  { id: "stripe-live", re: /sk_live_[A-Za-z0-9]{10,}/ },
  { id: "stripe-test", re: /sk_test_[A-Za-z0-9]{10,}/ },
  { id: "ghp", re: /ghp_[A-Za-z0-9]{20,}/ },
  { id: "gho", re: /gho_[A-Za-z0-9]{20,}/ },
  { id: "ghu", re: /ghu_[A-Za-z0-9]{20,}/ },
  { id: "github_pat", re: /github_pat_[A-Za-z0-9_]{20,}/ },
  { id: "akia", re: /AKIA[0-9A-Z]{12,}/ },
  { id: "slack", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: "xai", re: /xai-[A-Za-z0-9_-]{10,}/ },
  { id: "google-ai", re: /AIza[0-9A-Za-z_-]{20,}/ },
  { id: "npm", re: /npm_[A-Za-z0-9]{36}/ },
  { id: "pem", re: /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { id: "bearer", re: /Bearer [A-Za-z0-9._-]{20,}/ },
];

export function scanTextForSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const { id, re } of SECRET_SCAN_PATTERNS) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    if (global.test(text)) hits.push(id);
    if (hits.length >= 50) return hits;
  }
  return hits;
}
