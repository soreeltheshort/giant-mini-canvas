// Lightweight WebAudio-based UI sounds. No external dependencies.
// Three tiers: click (subtle), success (medium), submit (strongest).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

interface Tone {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function playTones(tones: Tone[]) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const t of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.value = t.freq;
    const start = now + (t.delay ?? 0);
    const peak = t.gain ?? 0.08;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(start);
    osc.stop(start + t.duration + 0.02);
  }
}

/** Subtle UI click — for buttons / selections. */
export function playClick() {
  playTones([{ freq: 880, duration: 0.06, type: "triangle", gain: 0.05 }]);
}

/** Medium confirmation — for successful order placement. */
export function playOrderPlaced() {
  playTones([
    { freq: 660, duration: 0.09, type: "triangle", gain: 0.09 },
    { freq: 990, duration: 0.12, type: "triangle", gain: 0.09, delay: 0.07 },
  ]);
}

/** Strongest confirmation — for submitting all orders. */
export function playOrdersSubmitted() {
  playTones([
    { freq: 523.25, duration: 0.12, type: "square", gain: 0.07 },
    { freq: 659.25, duration: 0.14, type: "square", gain: 0.07, delay: 0.09 },
    { freq: 783.99, duration: 0.22, type: "triangle", gain: 0.1, delay: 0.2 },
  ]);
}
