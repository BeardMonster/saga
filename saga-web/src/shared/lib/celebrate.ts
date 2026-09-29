// Completion rewards, tiered so bigger accomplishments feel bigger (an
// immediate, escalating payoff is the point — see README's ADHD design
// principles). Every regular sound is synthesized with the Web Audio API (no
// asset files) — the one exception is the rare checklist/project "surprise"
// (see SURPRISE_* below), a real recorded clip served from public/sounds/
// since that's a specific existing sound, not something worth trying to
// recreate from oscillators. Confetti is plain DOM elements animated with
// the Web Animations API (no library). Sound can be muted via the nav
// toggle; confetti honors the OS "reduce motion" setting.
//
// Every sound is organized into a THEME (see "Sound themes" below) — the
// rest of the app only ever asks for a symbolic name ("save", the "item"
// tier, ...), the same way a component reads a CSS custom property instead
// of a literal color. Swapping the whole sonic feel later is adding one
// more theme object, not touching any of the ~20 call sites across the app.

export type CelebrationTier = "item" | "checklist" | "project" | "goal";
export type UiSound =
  | "soundOn"
  | "soundOff"
  | "lightMode"
  | "darkMode"
  | "add"
  | "move"
  | "transfer"
  | "delete"
  | "restore"
  | "pin"
  | "unpin"
  | "edit"
  | "cancel"
  | "save"
  | "timerDone"
  | "raceWin"
  | "error";

const SOUND_KEY = "saga-reward-sound";

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable — toggle just won't persist */
  }
}

let audioCtx: AudioContext | null = null;

// Shared synthesis primitive — every theme's sounds are built from this, so
// a new theme is free to reach for entirely different notes/waveforms/
// timing without needing its own audio plumbing.
function playNotes(freqs: number[], opts: { step: number; type: OscillatorType; length: number; volume: number }) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = audioCtx ?? new AudioContextClass();
  const ctx = audioCtx;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.value = freq;
    const start = now + i * opts.step;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(opts.volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + opts.length + 0.05);
  });
}

// A short burst of filtered white noise — the "crowd" half of a cheer,
// underneath the chant blips below. Not built from playNotes since it needs
// a noise buffer, not an oscillator.
function noiseBurst(ctx: AudioContext, start: number, duration: number, opts: { volume: number; filterFreq: number; filterQ?: number }) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = opts.filterFreq;
  filter.Q.value = opts.filterQ ?? 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(opts.volume, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(start);
  noise.stop(start + duration + 0.05);
}

// One "wort!" — a pair of slightly detuned sawtooth oscillators (the
// detuning is what gives it a rough, chanting-voices texture instead of a
// clean synth tone) pitch-bent upward through a lowpass filter to round off
// the sawtooth's harsh edge into something closer to a shout than a buzz.
function chantBlip(ctx: AudioContext, start: number, baseFreq: number, duration: number, volume: number) {
  [-6, 6].forEach((detune) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(baseFreq, start);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, start + duration * 0.7);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
}

// A synthesized crowd-chant-and-pop cheer — built as a candidate for the
// checklist/project "surprise" sound, but Brandon preferred the real Grunt
// Birthday Party clip for that slot (see SURPRISE_AUDIO_URL below) and asked
// to keep this one for a different use later rather than delete it. Not
// wired to any trigger yet. Built from raw nodes rather than playNotes since
// it needs pitch envelopes and a noise layer, not fixed-frequency notes.
export function playPartyCheer() {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = audioCtx ?? new AudioContextClass();
  const ctx = audioCtx;
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;

  noiseBurst(ctx, now, 0.7, { volume: 0.12, filterFreq: 1800 });
  [0, 0.2, 0.4].forEach((offset) => chantBlip(ctx, now + offset, 150, 0.16, 0.22));

  const pop = ctx.createOscillator();
  pop.type = "triangle";
  pop.frequency.setValueAtTime(1200, now + 0.58);
  pop.frequency.exponentialRampToValueAtTime(2000, now + 0.68);
  const popGain = ctx.createGain();
  popGain.gain.setValueAtTime(0, now + 0.58);
  popGain.gain.linearRampToValueAtTime(0.15, now + 0.6);
  popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  pop.connect(popGain).connect(ctx.destination);
  pop.start(now + 0.58);
  pop.stop(now + 0.8);
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#facc15"];

// Confetti is a visual reward, not a themeable "sound" — every theme uses
// the same burst, sized per tier by that theme's own confettiCount.
function confetti(count: number, origin: { x: number; y: number }) {
  if (count === 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    const size = 6 + Math.random() * 6;
    el.style.cssText =
      `position:fixed;left:${origin.x}px;top:${origin.y}px;width:${size}px;height:${size * 0.6}px;` +
      `background:${COLORS[i % COLORS.length]};border-radius:2px;pointer-events:none;z-index:9999;`;
    document.body.appendChild(el);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // mostly upward fan
    const speed = 160 + Math.random() * 260;
    const dx = Math.cos(angle) * speed;
    const peakY = Math.sin(angle) * speed;
    const fall = 260 + Math.random() * 240;
    const spin = (Math.random() - 0.5) * 900;
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px,${peakY}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px,${peakY + fall}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 700, easing: "cubic-bezier(.2,.6,.4,1)" },
    );
    anim.onfinish = () => el.remove();
  }
}

// ── Sound themes ───────────────────────────────────────────────────────
// A theme supplies every symbolic sound/celebration/haptic/confetti-size
// the app can ask for. Only ONE theme exists today ("chimes" — the same
// synth cues this app has always used); the registry + getter/setter below
// is real, working plumbing for adding more later, not a stub — a second
// theme is just another `buildXTheme()` added to SOUND_THEMES, with zero
// changes anywhere else in the app (every call site only ever names a
// UiSound or a CelebrationTier, never a literal frequency).

interface SoundTheme {
  id: string;
  label: string;
  sounds: Record<UiSound, () => void>;
  celebrations: Record<CelebrationTier, () => void>;
  haptics: Record<CelebrationTier, number | number[]>;
  confettiCount: Record<CelebrationTier, number>;
}

function buildChimesTheme(): SoundTheme {
  // C5 D5 E5 G5 C6 E6 G6 — everything is drawn from one major scale so any
  // combination sounds consonant.
  const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568.0 };

  return {
    id: "chimes",
    label: "Chimes",

    celebrations: {
      item: () => playNotes([N.C5, N.E5], { step: 0.08, type: "sine", length: 0.25, volume: 0.15 }),
      checklist: () => playNotes([N.C5, N.E5, N.G5, N.C6], { step: 0.09, type: "triangle", length: 0.4, volume: 0.17 }),
      project: () => {
        playNotes([N.C5, N.E5, N.G5, N.C6, N.G5, N.C6], { step: 0.1, type: "triangle", length: 0.5, volume: 0.18 });
        playNotes([N.C6, N.E6, N.G6], { step: 0, type: "sine", length: 1.1, volume: 0.08 });
      },
      goal: () => {
        playNotes([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.E6, N.G6], { step: 0.11, type: "triangle", length: 0.6, volume: 0.18 });
        playNotes([N.C6, N.E6, N.G6], { step: 0, type: "sine", length: 1.6, volume: 0.09 });
      },
    },

    haptics: {
      item: 10,
      checklist: [15, 40, 15],
      project: [20, 40, 20, 40, 40],
      goal: [30, 50, 30, 50, 30, 50, 80],
    },

    confettiCount: { item: 0, checklist: 36, project: 70, goal: 120 },

    // Short cues for interface changes (see core/api/client.ts for how a
    // mutation picks one): quiet so a busy screen doesn't get noisy, each
    // with its own contour so they're tellable apart by ear.
    sounds: {
      soundOn: () => playNotes([N.G5, N.C6, N.E6, N.G6], { step: 0.06, type: "sine", length: 0.2, volume: 0.14 }),
      soundOff: () => playNotes([N.G5, N.E5, N.C5, 261.63], { step: 0.08, type: "triangle", length: 0.22, volume: 0.13 }),
      lightMode: () => playNotes([587.33, 880], { step: 0.09, type: "sine", length: 0.32, volume: 0.13 }),
      darkMode: () => playNotes([392, 293.66], { step: 0.12, type: "sine", length: 0.4, volume: 0.12 }),
      add: () => playNotes([659.25, 880], { step: 0.05, type: "sine", length: 0.16, volume: 0.1 }),
      move: () => playNotes([880, 659.25], { step: 0.04, type: "sine", length: 0.08, volume: 0.08 }),
      transfer: () => playNotes([440, 660, 880], { step: 0.035, type: "triangle", length: 0.12, volume: 0.09 }),
      delete: () => playNotes([392, 293.66, 220], { step: 0.06, type: "triangle", length: 0.22, volume: 0.24 }),
      pin: () => playNotes([1046.5, 1318.5], { step: 0.04, type: "sine", length: 0.1, volume: 0.09 }),
      unpin: () => playNotes([783.99, 523.25], { step: 0.05, type: "triangle", length: 0.1, volume: 0.08 }),
      edit: () => playNotes([523.25, 698.46], { step: 0.04, type: "sine", length: 0.09, volume: 0.08 }),
      cancel: () => playNotes([587.33, 440], { step: 0.05, type: "triangle", length: 0.1, volume: 0.09 }),
      save: () => playNotes([783.99, 987.77], { step: 0.07, type: "sine", length: 0.2, volume: 0.11 }),
      timerDone: () => playNotes([N.G5, N.E5, N.C5], { step: 0.14, type: "sine", length: 0.5, volume: 0.13 }),
      raceWin: () => playNotes([N.C5, N.E5, N.G5, N.C6, N.E6], { step: 0.06, type: "triangle", length: 0.3, volume: 0.16 }),
      // Deliberately dissonant (square wave, no shared scale) — distinct
      // from every other cue so a failed save never reads as quiet success.
      // Kept short and quiet rather than harsh — a flag, not a scolding.
      error: () => playNotes([233.08, 220], { step: 0, type: "square", length: 0.18, volume: 0.11 }),
      restore: () => playNotes([329.63, 493.88, 659.25], { step: 0.05, type: "triangle", length: 0.18, volume: 0.1 }),
    },
  };
}

const SOUND_THEMES: Record<string, SoundTheme> = { chimes: buildChimesTheme() };
const DEFAULT_THEME_ID = "chimes";
const THEME_KEY = "saga-sound-theme";

export function getSoundThemeId(): string {
  try {
    return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function setSoundThemeId(id: string) {
  if (!SOUND_THEMES[id]) return;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* storage unavailable — choice just won't persist */
  }
}

// For a future theme picker in Settings — not wired into any UI yet.
export function listSoundThemes(): { id: string; label: string }[] {
  return Object.values(SOUND_THEMES).map((t) => ({ id: t.id, label: t.label }));
}

function activeTheme(): SoundTheme {
  return SOUND_THEMES[getSoundThemeId()] ?? SOUND_THEMES[DEFAULT_THEME_ID];
}

// Checklist/project completions are infrequent enough that a 1-in-5 surprise
// won't wear out — goal keeps its own dedicated fanfare untouched, since
// that's already the rarest, biggest celebration.
const SURPRISE_CHANCE = 0.2;
const SURPRISE_TIERS: CelebrationTier[] = ["checklist", "project"];
const SURPRISE_AUDIO_URL = "/sounds/grunt-birthday-party.mp3";

// Reused across calls rather than a `new Audio()` per play, so a rapid
// double-completion doesn't leave a prior instance's decode/fetch racing
// the new one — `currentTime = 0` just restarts it from the top.
let surpriseAudioEl: HTMLAudioElement | null = null;

function playSurpriseClip() {
  try {
    surpriseAudioEl = surpriseAudioEl ?? new Audio(SURPRISE_AUDIO_URL);
    surpriseAudioEl.currentTime = 0;
    void surpriseAudioEl.play();
  } catch {
    /* playback blocked/unsupported — silently skip, same as other sound failures */
  }
}

// For a "Preview" button in Settings — always plays regardless of the mute
// toggle, same reasoning as soundOn/soundOff (an explicit request to hear
// it, not a background cue that should honor mute).
export function previewSurpriseSound() {
  playSurpriseClip();
}

// `origin` is where the confetti bursts from (usually the clicked element);
// defaults to upper-middle of the screen when not given.
// `sound` overrides the tier's own chime (confetti/haptics still scale with
// the tier) — used for a Race the Clock win, which wants "checklist"-sized
// fanfare but its own distinct sound.
export function celebrate(tier: CelebrationTier, origin?: { x: number; y: number }, sound?: UiSound) {
  const theme = activeTheme();
  const surprise = !sound && SURPRISE_TIERS.includes(tier) && Math.random() < SURPRISE_CHANCE;
  if (isSoundOn()) (sound ? () => playUiSound(sound) : surprise ? playSurpriseClip : theme.celebrations[tier])();
  try {
    navigator.vibrate?.(theme.haptics[tier]);
  } catch {
    /* haptics unsupported */
  }
  confetti(theme.confettiCount[tier], origin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.35 });
}

export function originOf(event: { clientX: number; clientY: number }) {
  return { x: event.clientX, y: event.clientY };
}

// soundOn/soundOff always play (they announce the change to the mute
// setting itself); every other cue respects it.
export function playUiSound(kind: UiSound) {
  if (kind !== "soundOn" && kind !== "soundOff" && !isSoundOn()) return;
  activeTheme().sounds[kind]();
  try {
    navigator.vibrate?.(kind === "error" ? [15, 40, 15] : 10);
  } catch {
    /* haptics unsupported */
  }
}
