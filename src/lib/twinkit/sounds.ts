/** Tiny Web Audio “game juice” — no asset files required. */

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export async function unlockAudio(): Promise<void> {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
  unlocked = c.state === "running";
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  gain = 0.08,
  slideTo?: number,
) {
  const c = getCtx();
  if (!c || !unlocked) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, slideTo),
      c.currentTime + start + dur,
    );
  }
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

export function playCheck(): void {
  void unlockAudio().then(() => {
    tone(660, 0, 0.07, "square", 0.05);
    tone(880, 0.05, 0.09, "square", 0.04);
  });
}

export function playSkip(): void {
  void unlockAudio().then(() => {
    tone(320, 0, 0.08, "triangle", 0.04, 180);
  });
}

export function playSectionComplete(): void {
  void unlockAudio().then(() => {
    tone(523.25, 0, 0.1, "square", 0.05);
    tone(659.25, 0.09, 0.1, "square", 0.05);
    tone(783.99, 0.18, 0.14, "square", 0.055);
    tone(1046.5, 0.3, 0.2, "triangle", 0.04);
  });
}

export function playProgressTick(): void {
  void unlockAudio().then(() => {
    tone(440, 0, 0.04, "sine", 0.03);
  });
}

export function playFanfare(): void {
  void unlockAudio().then(() => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) => {
      tone(n, i * 0.09, 0.16, i % 2 === 0 ? "square" : "triangle", 0.05);
    });
  });
}

export function playYeet(): void {
  void unlockAudio().then(() => {
    tone(600, 0, 0.35, "sawtooth", 0.045, 80);
    tone(900, 0.05, 0.25, "square", 0.03, 60);
  });
}

export function playClick(): void {
  void unlockAudio().then(() => {
    tone(240, 0, 0.03, "square", 0.025);
  });
}
