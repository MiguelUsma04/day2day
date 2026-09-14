import { Platform } from 'react-native';

/**
 * Short confirmation chime, synthesised with the Web Audio API.
 *
 * Generating the tone avoids shipping an audio asset and keeps the PWA small.
 * iOS only allows audio to start from a user gesture, which is exactly when
 * these fire (completing a task), so no unlock step is needed.
 */

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;
let enabled = true;

function getContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctx: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    if (!ctx) ctx = new Ctx();
    // Safari suspends the context until a gesture resumes it.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function isSoundEnabled() {
  return enabled;
}

/** Plays one note; `when` offsets it from now so notes can be sequenced. */
function note(context: AudioContext, freq: number, when: number, duration: number, gain: number) {
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, context.currentTime + when);

  // Ramped envelope: a hard start/stop clicks audibly.
  amp.gain.setValueAtTime(0.0001, context.currentTime + when);
  amp.gain.exponentialRampToValueAtTime(gain, context.currentTime + when + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration);

  osc.connect(amp);
  amp.connect(context.destination);
  osc.start(context.currentTime + when);
  osc.stop(context.currentTime + when + duration + 0.02);
}

/** Rising two-note chime for completing something. */
export function playComplete() {
  if (!enabled) return;
  const context = getContext();
  if (!context) return;
  try {
    note(context, 880, 0, 0.1, 0.16);
    note(context, 1318.5, 0.085, 0.14, 0.13);
  } catch {
    // Audio is a nicety; never let it break the interaction.
  }
}

/** Single lower note for undoing a completion. */
export function playUndo() {
  if (!enabled) return;
  const context = getContext();
  if (!context) return;
  try {
    note(context, 440, 0, 0.11, 0.12);
  } catch {
    // As above.
  }
}

/** Soft click for deletions. */
export function playDelete() {
  if (!enabled) return;
  const context = getContext();
  if (!context) return;
  try {
    note(context, 320, 0, 0.09, 0.11);
  } catch {
    // As above.
  }
}
