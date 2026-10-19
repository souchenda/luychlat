/**
 * The «LCA Approval» Telegram group's avatar (founder, 19/10/2026): the rabbit mascot holding the gold coin
 * (public/logo.png) on dark emerald, «APPROVAL» in gold in a pill under it — 1024 × 1024, everything inside the
 * centre circle Telegram crops to. Writes public/logo-approval.png (served at /logo-approval.png).
 *   npx tsx scripts/generate-approval-logo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import { FAMILIES, loadFonts, roundRect } from "../src/lib/server/poster-kit";

const S = 1024;

async function main() {
  loadFonts();
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  // Dark luxury emerald, a soft glow behind the mascot.
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#022c22");
  bg.addColorStop(0.6, "#064e3b");
  bg.addColorStop(1, "#011d16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  const glow = ctx.createRadialGradient(S / 2, 420, 0, S / 2, 420, 420);
  glow.addColorStop(0, "rgba(16,185,129,0.35)");
  glow.addColorStop(1, "rgba(16,185,129,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  // A thin gold ring just inside Telegram's circle.
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 26, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(252,211,77,0.55)";
  ctx.stroke();

  const logo = await loadImage(
    readFileSync(path.join(process.cwd(), "public", "logo.png")),
  );
  const tile = 440;
  const tx = (S - tile) / 2;
  const ty = 200;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 40;
  roundRect(ctx, tx, ty, tile, tile, 96);
  ctx.fillStyle = "#065f46";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, tx, ty, tile, tile, 96);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(logo, tx, ty, tile, tile);
  ctx.restore();
  roundRect(ctx, tx, ty, tile, tile, 96);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#fcd34d";
  ctx.stroke();

  // «APPROVAL» in a gold-ringed pill under the rabbit.
  const label = "APPROVAL";
  ctx.font = `800 76px ${FAMILIES}`;
  ctx.letterSpacing = "10px";
  const w = ctx.measureText(label).width + 110;
  const py = ty + tile + 58;
  roundRect(ctx, (S - w) / 2, py, w, 118, 59);
  ctx.fillStyle = "rgba(2,44,34,0.85)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#fcd34d";
  ctx.stroke();
  const gold = ctx.createLinearGradient(0, py, 0, py + 118);
  gold.addColorStop(0, "#fef3c7");
  gold.addColorStop(0.5, "#fcd34d");
  gold.addColorStop(1, "#d97706");
  ctx.fillStyle = gold;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, S / 2 + 5, py + 62);

  writeFileSync(
    path.join(process.cwd(), "public", "logo-approval.png"),
    canvas.toBuffer("image/png"),
  );
  console.log("public/logo-approval.png");
}

void main();
