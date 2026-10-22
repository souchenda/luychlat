/**
 * Flip to hide (founder, 22/10/2026 — Task #461, like ABA): turn the phone face down and the balances are masked at once,
 * with one short buzz to say so — no need to look. Pure: the samples come from `deviceorientation` (beta, the front-to-
 * back tilt: about 0° lying face up, about ±180° face down — the same on Android and iPhone, unlike devicemotion's
 * gravity z, whose sign iOS Safari reverses); the listener is components/privacy/flip-to-hide.tsx.
 *
 * Not on a walk or in a pocket by chance: the screen must stay down — tilted past 150° — for a quarter of a second, and
 * after it fires it waits until the phone is turned back up (under 90°) before it can fire again. Hiding is all it ever
 * does: showing the balances again is always the person's own tap on the eye.
 */
export const FLIP_DEGREES = 150
export const FLIP_HOLD_MS = 250
const REARM_DEGREES = 90

export type FlipDetector = {
  /** One reading (beta in degrees, t in ms): true exactly when the phone has just been laid face down. */
  sample(beta: number | null | undefined, t: number): boolean
}

export function createFlipDetector(o: { degrees?: number; holdMs?: number } = {}): FlipDetector {
  const limit = o.degrees ?? FLIP_DEGREES
  const hold = o.holdMs ?? FLIP_HOLD_MS
  let downSince: number | null = null
  let armed = true
  return {
    sample(beta, t) {
      if (beta == null || !Number.isFinite(beta)) return false
      const tilt = Math.abs(beta)
      if (tilt < REARM_DEGREES) {
        armed = true // turned back up: ready for the next flip
        downSince = null
        return false
      }
      if (tilt < limit) {
        downSince = null // tilted, not face down
        return false
      }
      downSince ??= t
      if (!armed || t - downSince < hold) return false
      armed = false
      return true
    },
  }
}

/** iOS asks before the tilt can be read (DeviceOrientationEvent.requestPermission, from a tap); elsewhere it is there. */
export type MotionPermission = "granted" | "denied" | "not-needed"

type OrientationEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> }

export async function requestMotionPermission(ctor: OrientationEventCtor | undefined): Promise<MotionPermission> {
  if (!ctor || typeof ctor.requestPermission !== "function") return "not-needed"
  try {
    return (await ctor.requestPermission()) === "granted" ? "granted" : "denied"
  } catch {
    return "denied" // asked outside a tap, or refused
  }
}
