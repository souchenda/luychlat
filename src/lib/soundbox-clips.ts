/**
 * The SoundBox clips' exact format (founder, 24/10/2026 — Task #490): a new clip must sound like one of the 27 when they
 * are joined back to back. Measured on the 27 in public/audio/soundbox/khmer (ffmpeg volumedetect, 24/10/2026): mono
 * 24 kHz MP3 at 64 kbps, trimmed at −45 dB with 15 ms in front and 20 ms behind (Task #465), mean volume −15.5 … −25.1 dB
 * (median −19.0), the loudest peak −2.1 dB; the 1.2x / 1.3x sets pitch-kept with atempo. Pure: the script
 * (scripts/soundbox-closing-tts.ts) builds its ffmpeg calls from here, so the tests check the format without ffmpeg.
 */
export const CLIP_FORMAT = {
  sampleRate: 24_000,
  channels: 1,
  bitrate: "64k",
  trimThresholdDb: -45,
  leadMs: 15,
  tailPadS: 0.02,
  /** The median mean volume of the 27; a new clip is brought to it (±1 dB checked after). */
  meanVolumeDb: -19,
  /** Never louder than the loudest of the 27. */
  peakDb: -2,
  /** Never boosted more than this: a near-silent synthesis is an error, not something to amplify. */
  maxGainDb: 15,
  speeds: [1.2, 1.3] as const,
} as const

/** The trim of Task #465: leading and trailing silence off, the same short breath kept around the word. */
export const trimFilter = () =>
  `silenceremove=start_periods=1:start_threshold=${CLIP_FORMAT.trimThresholdDb}dB,areverse,silenceremove=start_periods=1:start_threshold=${CLIP_FORMAT.trimThresholdDb}dB,areverse,adelay=${CLIP_FORMAT.leadMs},apad=pad_dur=${CLIP_FORMAT.tailPadS}`

/** The gain that brings a measured clip to the 27's loudness; null when it cannot be trusted (silent or far off). */
export function clipGainDb(measuredMeanDb: number): number | null {
  if (!Number.isFinite(measuredMeanDb)) return null
  const gain = Math.round((CLIP_FORMAT.meanVolumeDb - measuredMeanDb) * 10) / 10
  return Math.abs(gain) > CLIP_FORMAT.maxGainDb ? null : gain
}

/** The finished clip: the gain, a limiter at the 27's loudest peak, the 27's encoding, no tags (they join gaplessly). */
export function encodeArgs(input: string, output: string, gainDb: number): string[] {
  const limit = Math.pow(10, CLIP_FORMAT.peakDb / 20).toFixed(3)
  return ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `${trimFilter()},volume=${gainDb}dB,alimiter=limit=${limit}:level=disabled`, ...outputArgs(output)]
}

/** A faster set from the finished clip, pitch kept — exactly how x1.2 and x1.3 of the 27 were made. */
export const tempoArgs = (input: string, output: string, speed: number) => ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `atempo=${speed}`, ...outputArgs(output)]

const outputArgs = (output: string) => ["-ac", String(CLIP_FORMAT.channels), "-ar", String(CLIP_FORMAT.sampleRate), "-c:a", "libmp3lame", "-b:a", CLIP_FORMAT.bitrate, "-map_metadata", "-1", "-id3v2_version", "0", output]

/** ffmpeg volumedetect's report → the mean and the peak (dB); null when it printed none. */
export function parseVolume(stderr: string): { mean: number; peak: number } | null {
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+|-inf) dB/)
  const peak = stderr.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)
  if (!mean || !peak) return null
  const n = (s: string) => (s === "-inf" ? -Infinity : Number(s))
  return { mean: n(mean[1]), peak: n(peak[1]) }
}

/** A finished clip matches the 27: its mean within 1 dB of theirs, never over their loudest peak (0.5 dB of MP3 slack). */
export const clipMatches = (v: { mean: number; peak: number }) => Math.abs(v.mean - CLIP_FORMAT.meanVolumeDb) <= 1 && v.peak <= CLIP_FORMAT.peakDb + 0.5
