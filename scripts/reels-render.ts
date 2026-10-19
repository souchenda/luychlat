/**
 * Renders a short video to an MP4 + its DRAFT record (founder, 18/10/2026; docs/reels-video-engine.md). Publishes
 * nothing: the MP4 goes to the founder's private preview, and out only on their ✅ / 🚀 (tests/golden/publisher.test.ts).
 *   npx tsx scripts/reels-render.ts <script-id> <out.mp4> [voice1.mp3,voice2.mp3]
 * Without voice files, a draft preview with the subtitles, the effects and the ambient Adhan (no voices yet).
 */
import { REEL_SCRIPTS } from "../src/lib/islamic/reels-scripts";
import { renderReel } from "../src/lib/server/reels-frames";

const [id, out, voices] = process.argv.slice(2);
const script = REEL_SCRIPTS.find((s) => s.id === id);
if (!script || !out) {
  console.error(
    `usage: reels-render <${REEL_SCRIPTS.map((s) => s.id).join(" | ")}> <out.mp4> [voices,…]`,
  );
  process.exit(2);
}
async function main() {
  const t0 = Date.now();
  let last = 0;
  const artifact = await renderReel({
    script,
    out,
    voiceFiles: voices ? voices.split(",") : null,
    onProgress: (n, total) => {
      if (n - last >= 150 || n === total) {
        last = n;
        console.log(`frame ${n}/${total}`);
      }
    },
  });
  console.log(
    JSON.stringify(artifact),
    `${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

void main();
