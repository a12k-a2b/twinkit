export const GLOBAL_ENCOURAGEMENTS = [
  "You're not setting up a computer. You're cloning a brain.",
  "Every checkbox is a little revenge against future friction.",
  "The home Mac is going to be so smug when this works.",
  "Auth prompts are the boss doors. You're the final fantasy party.",
  "Slow is smooth. Smooth is a Mini that just works at 2am.",
  "If Gradle is downloading, that counts as progress. Hydrate.",
  "Permissions toggles are modern spells. Cast them carefully.",
  "You remembered more of your setup than you think. TwinKit holds the rest.",
  "Leaving a machine plugged in at home is peak adult engineering.",
  "This checklist exists so you never have to reconstruct lore from muscle memory again.",
];

export const MILESTONE_LINES: Record<number, string> = {
  10: "10% — the shoes are on.",
  25: "Quarter tank. The Mini can smell the configs already.",
  50: "Halfway. This is the part of the RPG where the music gets good.",
  75: "Three-quarters. Resist the urge to 'just wing the last bits.'",
  90: "90%. The only thing left is the stuff that feels optional but isn't.",
  100: "100%. Twin achieved. Go touch grass or ship a build.",
};

export function pickEncouragement(seed: number, pool: string[]): string {
  if (pool.length === 0) return GLOBAL_ENCOURAGEMENTS[0]!;
  return pool[Math.abs(seed) % pool.length]!;
}
