/**
 * The holy-day chime: one soft temple bell — a low "dong" that fades out in about two seconds
 * (founder, 11/10/2026: never pinpeat or temple music). Original, synthesized: the same partials
 * render public/audio/holy-day/temple-bell.mp3 and, where the file can't play, the Web Audio fallback.
 */

/** A bell's inharmonic partials: frequency (Hz), level, and how fast each fades (s to −60 dB). */
export const BELL_PARTIALS: readonly { f: number; gain: number; decay: number }[] = [
  { f: 147, gain: 0.35, decay: 2.4 }, // hum
  { f: 294, gain: 1, decay: 2.2 }, // strike (D4)
  { f: 350, gain: 0.45, decay: 1.6 }, // minor third
  { f: 441, gain: 0.3, decay: 1.3 }, // fifth
  { f: 588, gain: 0.25, decay: 1.0 },
  { f: 806, gain: 0.14, decay: 0.7 },
  { f: 1106, gain: 0.08, decay: 0.45 },
]

/** Seconds the chime lasts (the tail faded to silence). */
export const BELL_SECONDS = 2.2

/** One sample of the bell at time t (s), before normalising: a 6 ms attack, then each partial fades. */
export function bellSample(t: number): number {
  if (t < 0 || t > BELL_SECONDS) return 0
  const attack = Math.min(1, t / 0.006)
  const tail = t > BELL_SECONDS - 0.3 ? (BELL_SECONDS - t) / 0.3 : 1
  let s = 0
  for (const p of BELL_PARTIALS) s += p.gain * Math.exp((-6.9 * t) / p.decay) * Math.sin(2 * Math.PI * p.f * t)
  return s * attack * tail
}
