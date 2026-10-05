#!/usr/bin/env bash
# Builds the Android app (LuyChlat.apk) on the server and publishes it at
# https://<site>/LuyChlat.apk (served by Nginx from /var/www/luysmart-downloads).
#
#   sudo bash deploy/build-apk.sh
#
# Everything heavy runs in Docker (Node for `cap sync`, JDK 21 + Gradle for the
# build) with a memory cap, so the live site keeps its share. Kept between runs
# in /opt/luysmart-android: the Android SDK, the Gradle cache and the release
# signing key (created once, password random, never printed — back up the
# keystore/ folder: without it, testers must uninstall to get the next version).
#
# Only needed when the native side changes (capacitor.config.ts, android/, the
# icon, a plugin): web changes reach installed apps by themselves. Raise
# versionCode in android/app/build.gradle first so phones accept the update.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO=$(pwd)
WORK=/opt/luysmart-android
SRC=$WORK/src
SDK=$WORK/sdk
KEYS=$WORK/keystore
GRADLE_HOME=$WORK/gradle
OUT=/var/www/luysmart-downloads
JDK_IMAGE=eclipse-temurin:21-jdk
NODE_IMAGE=node:22-alpine
CMDLINE_TOOLS=commandlinetools-linux-14742923_latest.zip

# One build at a time.
exec 9>/var/lock/luysmart-apk.lock
flock -n 9 || { echo "✗ Another APK build is running" >&2; exit 1; }

mkdir -p "$SDK" "$KEYS" "$GRADLE_HOME" "$OUT"
chmod 700 "$KEYS"

echo "▸ 1/5 Source (committed HEAD $(git -C "$REPO" rev-parse --short HEAD))"
rm -rf "$SRC"
mkdir -p "$SRC"
git -C "$REPO" archive HEAD | tar -x -C "$SRC"

echo "▸ 2/5 Capacitor sync (only the Capacitor packages, at the locked versions)"
# A small package.json with just what `cap sync` and the Android build need.
pkgs=$(python3 - "$REPO/package-lock.json" <<'PY'
import json, sys
lock = json.load(open(sys.argv[1]))["packages"]
names = ["@capacitor/cli", "@capacitor/core", "@capacitor/android", "@capacitor/share", "@capacitor/filesystem", "typescript"]
print(" ".join(f"{n}@{lock['node_modules/' + n]['version']}" for n in names))
PY
)
docker run --rm --memory=1g -v "$SRC":/app -w /app "$NODE_IMAGE" sh -euc "
  mv package.json package.full.json
  echo '{\"name\":\"luychlat-android\",\"private\":true}' > package.json
  npm install --save --ignore-scripts --no-audit --no-fund --loglevel=error $pkgs
  npx cap sync android
"

echo "▸ 3/5 Android SDK"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  tmp=$(mktemp -d)
  curl -fsSL "https://dl.google.com/android/repository/$CMDLINE_TOOLS" -o "$tmp/tools.zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
# Licences were accepted by the owner for this build; the Gradle plugin fetches any build-tools it needs.
docker run --rm --memory=1g -v "$SDK":/sdk "$JDK_IMAGE" sh -euc '
  yes | /sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/sdk --licenses >/dev/null
  /sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/sdk "platform-tools" "platforms;android-36" >/dev/null
'

echo "▸ 4/5 Release key"
if [ ! -f "$KEYS/keystore.properties" ]; then
  pass=$(openssl rand -hex 24)
  env_file=$(mktemp)
  chmod 600 "$env_file"
  printf 'KS_PASS=%s\n' "$pass" > "$env_file"
  docker run --rm --env-file "$env_file" -v "$KEYS":/ks "$JDK_IMAGE" keytool -genkeypair -noprompt \
    -keystore /ks/luychlat-release.jks -alias luychlat -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass:env KS_PASS -keypass:env KS_PASS -dname "CN=LuyChlat, O=LuyChlat, C=KH"
  rm -f "$env_file"
  # Private file only — in a subshell, so the rest of the build keeps the normal umask.
  (umask 077; printf 'storeFile=/ks/luychlat-release.jks\nstorePassword=%s\nkeyAlias=luychlat\nkeyPassword=%s\n' "$pass" "$pass" > "$KEYS/keystore.properties")
  unset pass
  chmod 600 "$KEYS"/*
  echo "  new release key in $KEYS — back this folder up"
fi
cp "$KEYS/keystore.properties" "$SRC/android/keystore.properties"

echo "▸ 5/5 Gradle build (capped at 2.5 GB and 1.5 CPU)"
# Small heap, no daemon, one worker: slower, but leaves the site its memory.
printf 'org.gradle.jvmargs=-Xmx1280m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8\norg.gradle.daemon=false\norg.gradle.workers.max=1\n' > "$GRADLE_HOME/gradle.properties"
docker run --rm --memory=2500m --cpus=1.5 --cpu-shares=256 \
  -e ANDROID_HOME=/sdk -e GRADLE_USER_HOME=/gradle \
  -v "$SRC":/app -v "$SDK":/sdk -v "$GRADLE_HOME":/gradle -v "$KEYS":/ks:ro \
  -w /app/android "$JDK_IMAGE" sh ./gradlew assembleRelease --no-daemon --console=plain -q

apk="$SRC/android/app/build/outputs/apk/release/LuyChlat-release.apk"
[ -f "$apk" ] || { echo "✗ APK not found: $apk" >&2; exit 1; }
install -m 0644 "$apk" "$OUT/LuyChlat.apk.new"
mv -f "$OUT/LuyChlat.apk.new" "$OUT/LuyChlat.apk"
(cd "$OUT" && sha256sum LuyChlat.apk > LuyChlat.apk.sha256 && chmod 644 LuyChlat.apk.sha256)
rm -f "$SRC/android/keystore.properties"
echo "✓ $(du -h "$OUT/LuyChlat.apk" | cut -f1) → $OUT/LuyChlat.apk ($(cut -c1-16 "$OUT/LuyChlat.apk.sha256")…)"
