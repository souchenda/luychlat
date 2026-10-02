#!/usr/bin/env sh
# Encodes a licensed Adhan recording for the app: mono, 64 kbps MP3, loudness
# normalised, metadata stripped (~300 KB for a 40 s Adhan).
#   scripts/adhan-encode.sh input.wav makkah   ->  public/adhan/makkah.mp3
# Then set `file: "/adhan/makkah.mp3"` and `credit` (reciter, source, licence)
# for that preset in src/lib/adhan-presets.ts. Needs ffmpeg.
set -eu
in="$1"
id="$2"
out="$(dirname "$0")/../public/adhan/$id.mp3"
ffmpeg -hide_banner -loglevel error -y -i "$in" -map_metadata -1 -vn -ac 1 -ar 44100 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a libmp3lame -b:a 64k "$out"
ls -l "$out"
