import type { ChecklistItem } from "./types";

/** Rough personal pace from check timestamps vs catalog minutes. */
export function computePace(
  checkedAt: Record<string, number>,
  items: ChecklistItem[],
): { ratio: number; label: string } | null {
  const timed = items
    .map((it) => ({ it, t: checkedAt[it.id] }))
    .filter((x): x is { it: ChecklistItem; t: number } => typeof x.t === "number")
    .sort((a, b) => a.t - b.t);
  if (timed.length < 3) return null;
  const wallMin = (timed[timed.length - 1]!.t - timed[0]!.t) / 60000;
  const catalog = timed.slice(1).reduce((s, x) => s + x.it.minutes, 0);
  if (catalog < 1 || wallMin < 0.5) return null;
  const ratio = wallMin / catalog;
  const label =
    ratio < 0.7
      ? "faster than catalog"
      : ratio > 1.6
        ? "slower than catalog — normal"
        : "about catalog pace";
  return { ratio, label };
}

export function personalRemaining(
  remainingCatalogMin: number,
  ratio: number | null,
): number {
  if (!ratio) return remainingCatalogMin;
  return Math.max(1, Math.round(remainingCatalogMin * ratio));
}
