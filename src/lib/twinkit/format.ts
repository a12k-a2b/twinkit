export function formatMinutes(min: number): string {
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "auth":
      return "Sign in";
    case "permission":
      return "Mac settings";
    case "script":
      return "Run script";
    case "verify":
      return "Check";
    case "download":
      return "Download";
    default:
      return "Do this";
  }
}
