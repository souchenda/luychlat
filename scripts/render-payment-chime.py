"""
Renders the payment chime «ទីង-ទីង» to a WAV (founder, 21/10/2026 — the native "Payment Alerts" channel needs a sound
file in the APK): the very tones of the SoundBox's Web Audio chime (src/lib/soundbox-audio.ts playPaymentChime — E6
then B6 triangle, a soft shimmer), so the counter phone sounds the same in the app and on the lock screen. Our own
synthesis — no third-party sound, no licence needed. Played twice (a notification is heard once; the counter needs
to catch it). Output: android/app/src/main/res/raw/payment_received.wav and public/audio/payment_received.wav.

    python scripts/render-payment-chime.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44_100
ROOT = Path(__file__).resolve().parent.parent


def tri(phase: float) -> float:
    """A triangle wave in [-1, 1] (as Web Audio's «triangle»)."""
    x = phase % 1.0
    return 4 * x - 1 if x < 0.5 else 3 - 4 * x


def env(t: float, length: float, peak: float) -> float:
    """Web Audio's ramps: 0.0001 → peak in 15 ms (exponential), then → 0.0001 at `length`."""
    if t < 0 or t > length + 0.05:
        return 0.0
    if t < 0.015:
        return 0.0001 * (peak / 0.0001) ** (t / 0.015)
    if t < length:
        return peak * (0.0001 / peak) ** ((t - 0.015) / (length - 0.015))
    return 0.0001


# (frequency, start, length, peak, wave) — playPaymentChime, as written there.
TONES = [(1318.5, 0.02, 0.35, 0.3, "triangle"), (1975.5, 0.18, 0.55, 0.25, "triangle"), (2637.0, 0.18, 0.4, 0.06, "sine")]


def render(repeat_at: float = 0.85, total: float = 1.75) -> list[float]:
    out = [0.0] * int(RATE * total)
    for offset in (0.0, repeat_at):
        for freq, start, length, peak, kind in TONES:
            s0 = int(RATE * (offset + start))
            for i in range(int(RATE * (length + 0.05))):
                t = i / RATE
                w = tri(freq * t) if kind == "triangle" else math.sin(2 * math.pi * freq * t)
                if s0 + i < len(out):
                    out[s0 + i] += w * env(t, length, peak)
    top = max(abs(v) for v in out) or 1.0
    return [v / top * 0.89 for v in out]  # −1 dBFS


def write(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in samples))
    print(path.relative_to(ROOT), f"{path.stat().st_size} bytes")


if __name__ == "__main__":
    s = render()
    write(ROOT / "android/app/src/main/res/raw/payment_received.wav", s)
    write(ROOT / "public/audio/payment_received.wav", s)
