// Server only: draws the short videos' frames with Skia (Khmer shaped as on the posters) from the pure scenes of
// lib/islamic/reels-renderer.ts, mixes the sound (lib/islamic/reels-audio.ts) and encodes the 9:16 MP4 with FFmpeg —
// the frames stream raw into FFmpeg's stdin, no image files on disk. Every render is a DRAFT artifact: it writes
// `<out>.json` with status "DRAFT", and nothing here publishes (tests/golden/publisher.test.ts); a video reaches a
// public channel only through the scheduled-post preview and the founder's ✅ / 🚀.
import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas"

import { khmerDigits } from "@/lib/dates"
import * as G from "@/lib/islamic/glossary"
import { audioCues, scriptMixArgs } from "@/lib/islamic/reels-audio"
import { DRAFT_MARK, frameTimes, sceneAt, SOPHEA_ART, SUBTITLE_BAND, SUBTITLE_STYLE, type ReelScene } from "@/lib/islamic/reels-renderer"
import { reelRenderable, reelSeconds, type ReelScript } from "@/lib/islamic/reels-scripts"
import { ffmpegArgs, REEL_FORMAT, reelTimeline } from "@/lib/islamic/reels-timeline"

import { drawIcon, FAMILIES, loadFonts, roundRect, wrap } from "./poster-kit"

const { width: W, height: H } = REEL_FORMAT
const GOLD = "#e9c46a"
const GOLD_SOFT = "rgba(233,196,106,0.55)"

export type ReelArt = { sophea: Image; logo: Image | null }

/** The artwork, decoded once per render (Sophea's master and the Islamic logo). */
export async function loadReelArt(root = process.cwd()): Promise<ReelArt> {
  const sophea = await loadImage(readFileSync(path.join(root, SOPHEA_ART.file)))
  const logo = await loadImage(readFileSync(path.join(root, "public", "icon-islamic.png"))).catch(() => null)
  return { sophea, logo }
}

// ─── The layers ──────────────────────────────────────────────────────────────────────────────────

function field(ctx: SKRSContext2D, s: ReelScene) {
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#022c22")
  bg.addColorStop(0.55, "#064e3b")
  bg.addColorStop(1, "#065f46")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // The lattice of eight-point stars, drifting slowly upward.
  ctx.save()
  ctx.strokeStyle = "rgba(233,196,106,0.07)"
  ctx.lineWidth = 1.5
  const step = 135
  for (let y = -step - s.drift; y < H + step; y += step) {
    for (let x = (Math.round((y + s.drift) / step) % 2) * (step / 2) - step / 2; x < W + step; x += step) {
      const r = 34
      ctx.strokeRect(x - r, y - r, 2 * r, 2 * r)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.strokeRect(-r, -r, 2 * r, 2 * r)
      ctx.restore()
    }
  }
  ctx.restore()
  // The glow, wandering.
  const glow = ctx.createRadialGradient(s.glow.x, s.glow.y, 0, s.glow.x, s.glow.y, W * 0.8)
  glow.addColorStop(0, "rgba(16,185,129,0.24)")
  glow.addColorStop(1, "rgba(16,185,129,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
}

function frame(ctx: SKRSContext2D) {
  roundRect(ctx, 22, 22, W - 44, H - 44, 44)
  ctx.lineWidth = 4
  ctx.strokeStyle = GOLD
  ctx.stroke()
  // The mihrab arch around the stage.
  const left = 70
  const right = W - 70
  const top = 380
  ctx.beginPath()
  ctx.moveTo(left, 1540)
  ctx.lineTo(left, top + 170)
  ctx.quadraticCurveTo(left, top + 20, W / 2, top)
  ctx.quadraticCurveTo(right, top + 20, right, top + 170)
  ctx.lineTo(right, 1540)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD_SOFT
  ctx.stroke()
}

function brand(ctx: SKRSContext2D, art: ReelArt) {
  const top = 236
  const mark = 84
  const x = 90
  if (art.logo) {
    ctx.save()
    roundRect(ctx, x, top, mark, mark, 22)
    ctx.clip()
    ctx.drawImage(art.logo, x, top, mark, mark)
    ctx.restore()
  }
  roundRect(ctx, x, top, mark, mark, 22)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 38px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("អេប លុយឆ្លាត", x + mark + 20, top + 40)
  ctx.font = `600 28px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText("សហគមន៍ឥស្លាម", x + mark + 20, top + 78)
}

function draftMark(ctx: SKRSContext2D) {
  ctx.save()
  ctx.font = `700 26px ${FAMILIES}`
  const w = ctx.measureText(DRAFT_MARK).width + 40
  const x = W - 90 - w
  roundRect(ctx, x, 252, w, 52, 26)
  ctx.fillStyle = "rgba(190,18,60,0.85)"
  ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.fillText(DRAFT_MARK, x + w / 2, 287)
  ctx.restore()
}

function crescent(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.38, cy - r * 0.2, r * 0.82, 0, Math.PI * 2, true)
  ctx.fill("evenodd")
}

/** The phone binging AI drama: a dark screen, the episode bar, the feed of clips scrolling under the thumb. */
function phone(ctx: SKRSContext2D, p: NonNullable<ReelScene["phone"]>) {
  const w = 450
  const h = 760
  ctx.save()
  ctx.globalAlpha = p.opacity
  ctx.translate(p.x + p.shake, p.y)
  ctx.scale(p.scale, p.scale)
  roundRect(ctx, -w / 2 - 14, -h / 2 - 14, w + 28, h + 28, 64)
  ctx.fillStyle = "#0b1220"
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(233,196,106,0.6)"
  ctx.stroke()
  roundRect(ctx, -w / 2, -h / 2, w, h, 52)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = "#111827"
  ctx.fillRect(-w / 2, -h / 2, w, h)
  // The feed: clips sliding up.
  const colours = ["#7c3aed", "#db2777", "#2563eb", "#ea580c"]
  for (let i = -1; i < 4; i++) {
    const y = -h / 2 + 110 + i * 420 - p.scroll
    const g = ctx.createLinearGradient(0, y, 0, y + 390)
    g.addColorStop(0, colours[(i + 4) % 4])
    g.addColorStop(1, "#111827")
    roundRect(ctx, -w / 2 + 22, y, w - 44, 390, 28)
    ctx.fillStyle = g
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.beginPath()
    ctx.moveTo(-26, y + 160)
    ctx.lineTo(34, y + 195)
    ctx.lineTo(-26, y + 230)
    ctx.closePath()
    ctx.fill()
  }
  // The episode bar.
  ctx.fillStyle = "#0b1220"
  ctx.fillRect(-w / 2, -h / 2, w, 92)
  ctx.font = `700 34px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.fillText(`រឿងអេអាយ · ភាគ ${khmerDigits(String(p.episode))}`, 0, -h / 2 + 60)
  ctx.restore()
  ctx.restore()
}

/** The call to prayer is sounding: a gold crescent, pulsing, with the word. */
function adhan(ctx: SKRSContext2D, a: NonNullable<ReelScene["adhanPulse"]>) {
  ctx.save()
  ctx.strokeStyle = `rgba(233,196,106,${0.5 * (1 - a.pulse)})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(a.x, a.y, a.r * 1.3 + a.r * a.pulse, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = GOLD
  crescent(ctx, a.x, a.y, a.r)
  ctx.font = `700 ${Math.round(a.r * 0.75)}px ${FAMILIES}`
  ctx.textAlign = "center"
  ctx.fillText(G.ADHAN, a.x, a.y + a.r * 2.3)
  ctx.restore()
}

/** Sophea the Rabbit: the master tile, a gold ring, a soft glow; scaled, turned and faded per the scene. */
function sophea(ctx: SKRSContext2D, art: ReelArt, s: NonNullable<ReelScene["sophea"]>) {
  if (s.opacity <= 0 || s.scale <= 0) return
  const { crop } = SOPHEA_ART
  const size = s.size
  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rotate)
  ctx.scale(s.scale, s.scale)
  ctx.shadowColor = "rgba(16,185,129,0.55)"
  ctx.shadowBlur = 60
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.2)
  ctx.fillStyle = "#065f46"
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.save()
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.2)
  ctx.clip()
  ctx.drawImage(art.sophea, crop.x, crop.y, crop.w, crop.h, -size / 2, -size / 2, size, size)
  ctx.restore()
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.2)
  ctx.lineWidth = 6
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.restore()
}

/** The dash to wudu: speed lines streaking across. */
function dash(ctx: SKRSContext2D, k: number) {
  ctx.save()
  ctx.strokeStyle = `rgba(236,253,245,${0.55 * k})`
  ctx.lineCap = "round"
  for (let i = 0; i < 9; i++) {
    const y = 540 + i * 30
    const len = 220 + ((i * 97) % 260)
    const x = W - ((k * 1400 + i * 173) % (W + len))
    ctx.lineWidth = 6 - (i % 3) * 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** The subtitles, newest lowest, stacked up from the band's bottom; each fitted to ≤ 2 lines (58 → 44 px). */
function subtitles(ctx: SKRSContext2D, layers: ReelScene["subtitles"]) {
  let bottom = SUBTITLE_BAND.bottom
  for (const layer of [...layers].reverse().slice(0, SUBTITLE_BAND.max)) {
    const style = SUBTITLE_STYLE[layer.speaker]
    let size = 58
    let lines: string[] = []
    for (const s of [58, 54, 50, 46, 44]) {
      ctx.font = `700 ${s}px ${FAMILIES}`
      lines = wrap(ctx, layer.text, 900, 99)
      size = s
      if (lines.length <= 2) break
    }
    const lineH = Math.round(size * 1.55)
    const blockH = lines.length * lineH + 36
    const labelH = style.label && layer.current ? 46 : 0
    const top = bottom - blockH
    if (top - labelH < SUBTITLE_BAND.top) break
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.translate(0, layer.rise)
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    if (style.pill) {
      roundRect(ctx, W / 2 - widest / 2 - 34, top, widest + 68, blockH, 30)
      ctx.fillStyle = style.pill
      ctx.fill()
    }
    if (style.label && layer.current) {
      ctx.font = `700 28px ${FAMILIES}`
      ctx.fillStyle = GOLD
      ctx.textAlign = "center"
      ctx.fillText(style.label, W / 2, top - 16)
    }
    ctx.font = `700 ${size}px ${FAMILIES}`
    ctx.fillStyle = style.color
    ctx.textAlign = "center"
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + 18 + size * 1.05 + i * lineH))
    ctx.restore()
    bottom = top - labelH - SUBTITLE_BAND.gap
  }
}

/** The end card: the links to the app, under Sophea. */
function endCard(ctx: SKRSContext2D, k: number) {
  if (k <= 0) return
  ctx.save()
  ctx.globalAlpha = k
  const y = 900 + (1 - k) * 30
  ctx.font = `700 48px ${FAMILIES}`
  const url = "app.luychlat.com"
  const w = ctx.measureText(url).width + 140
  roundRect(ctx, W / 2 - w / 2, y - 62, w, 92, 46)
  ctx.fillStyle = "rgba(233,196,106,0.16)"
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD
  ctx.stroke()
  drawIcon(ctx, "globe", W / 2 - w / 2 + 52, y - 16)
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "left"
  ctx.fillText(url, W / 2 - w / 2 + 88, y)
  ctx.font = `600 36px ${FAMILIES}`
  ctx.textAlign = "center"
  ctx.fillStyle = GOLD
  ctx.fillText("@LuyChlatIslamic", W / 2, y + 86)
  ctx.restore()
}

/** One frame of a scene → the canvas. */
export function drawReelFrame(ctx: SKRSContext2D, s: ReelScene, art: ReelArt) {
  field(ctx, s)
  frame(ctx)
  brand(ctx, art)
  if (s.phone) phone(ctx, s.phone)
  if (s.adhanPulse) adhan(ctx, s.adhanPulse)
  if (s.dash !== null) dash(ctx, s.dash)
  if (s.sophea) sophea(ctx, art, s.sophea)
  endCard(ctx, s.endCard)
  subtitles(ctx, s.subtitles)
  if (s.draft) draftMark(ctx)
}

// ─── The render job ──────────────────────────────────────────────────────────────────────────────

/** The record of a render, written next to the MP4. A render is always a DRAFT until the founder's tap. */
export type ReelArtifact = { file: string; scriptId: string; episode: number; status: "DRAFT"; scriptApproved: boolean; voices: boolean; seconds: number; frames: number; renderedAt: string }

function run(cmd: string, args: string[], feed?: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [feed ? "pipe" : "ignore", "ignore", "pipe"] })
    let err = ""
    p.stderr?.on("data", (d) => (err = (err + d).slice(-4000)))
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`))))
    if (feed && p.stdin) feed(p.stdin).then(() => p.stdin!.end(), reject)
  })
}

/**
 * Renders a script to `<out>` (MP4) and `<out>.json` (the DRAFT record). `voiceFiles: null` = no voices yet (the
 * subtitles carry the lines). A script the founder has not approved renders only with the DRAFT mark on every frame.
 */
export async function renderReel(o: { script: ReelScript; voiceFiles: string[] | null; out: string; root?: string; ffmpeg?: string; onProgress?: (frame: number, total: number) => void }): Promise<ReelArtifact> {
  const root = o.root ?? process.cwd()
  const ffmpeg = o.ffmpeg ?? "ffmpeg"
  const seconds = reelSeconds(o.script)
  const approved = reelRenderable(o.script)
  loadFonts()
  const art = await loadReelArt(root)

  // 1. The sound.
  const mix = `${o.out}.audio.m4a`
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", ...scriptMixArgs(o.script, o.voiceFiles, root, mix)])

  // 2. The frames, raw into FFmpeg with the sound.
  const cues = reelTimeline(o.script)
  const sfxAt = audioCues(o.script).flatMap((c) => (c.kind === "sfx" ? [{ id: c.id, at: c.at }] : []))
  const adhanFrom = audioCues(o.script).find((c) => c.kind === "ambient")?.at ?? null
  const times = frameTimes(o.script)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", ...ffmpegArgs({ audio: mix, seconds, out: o.out })], async (stdin) => {
    for (const [i, t] of times.entries()) {
      drawReelFrame(ctx, sceneAt(o.script, t, { approved, sfxAt, adhanFrom, cues }), art)
      if (!stdin.write(canvas.data())) await new Promise((r) => stdin.once("drain", r))
      o.onProgress?.(i + 1, times.length)
    }
  })

  const artifact: ReelArtifact = { file: o.out, scriptId: o.script.id, episode: o.script.episode, status: "DRAFT", scriptApproved: approved, voices: o.voiceFiles !== null, seconds, frames: times.length, renderedAt: new Date().toISOString() }
  writeFileSync(`${o.out}.json`, JSON.stringify(artifact, null, 2))
  return artifact
}
