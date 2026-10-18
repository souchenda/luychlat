#!/bin/sh
# The short videos' comedy sound effects, synthesized with FFmpeg (founder, 18/10/2026) — made here from sine
# waves and noise, so they are ours: no sample library, no licence to track (CLAUDE.md Licensing).
# Writes public/audio/sfx/*.mp3 (48 kHz mono). Run where ffmpeg is installed (the app's container has it):
#   sh scripts/reels-sfx.sh [out_dir]
set -eu
OUT="${1:-public/audio/sfx}"
mkdir -p "$OUT"
enc="-ar 48000 -ac 1 -c:a libmp3lame -b:a 128k"

# Record scratch (0.45 s): a burst of noise swept through a band-pass, back and forth — the «wait, what?» cut.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.9" \
  -af "bandpass=f=1800:width_type=o:w=1.2,vibrato=f=9:d=0.9,afade=t=in:d=0.02,afade=t=out:st=0.3:d=0.15,volume=1.6" \
  $enc "$OUT/record_scratch.mp3"

# Dramatic thud (0.9 s): a low 55 Hz hit with a fast decay and a touch of noise on the attack — the punchline.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=f=55:d=0.9" -f lavfi -i "anoisesrc=d=0.08:c=brown:a=0.6" \
  -filter_complex "[0:a]volume=1.8,afade=t=out:st=0.05:d=0.85:curve=exp[a];[1:a]lowpass=f=400[b];[a][b]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95" \
  $enc "$OUT/dramatic_thud.mp3"

# Cartoon dash (0.7 s): a rising whistle (400 → 1800 Hz) over a short whoosh — running off to make wudu.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=0.5*sin(2*PI*(400*t+1000*t*t)):s=48000:d=0.7" -f lavfi -i "anoisesrc=d=0.7:c=white:a=0.25" \
  -filter_complex "[1:a]bandpass=f=1200:width_type=o:w=2,afade=t=in:d=0.1,afade=t=out:st=0.4:d=0.3[w];[0:a]afade=t=in:d=0.03,afade=t=out:st=0.5:d=0.2[s];[s][w]amix=inputs=2:normalize=0,alimiter=limit=0.95" \
  $enc "$OUT/cartoon_dash.mp3"

# Pop chime (0.8 s): a soft pop and two bell tones a fifth apart (E6, B6) — the call to the app.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=0.45*sin(2*PI*1318.5*t)*exp(-5*t)+0.3*sin(2*PI*1975.5*t)*exp(-6*t)*gte(t\,0.06):s=48000:d=0.8" -f lavfi -i "anoisesrc=d=0.03:c=white:a=0.5" \
  -filter_complex "[1:a]highpass=f=2000[p];[0:a][p]amix=inputs=2:normalize=0:duration=longest,afade=t=out:st=0.6:d=0.2,alimiter=limit=0.95" \
  $enc "$OUT/pop_chime.mp3"

ls -l "$OUT"
