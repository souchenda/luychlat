package com.luychlat.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The SoundBox announced by the phone itself (founder, 24/10/2026 — Task #487: a Huawei froze the WebView with the screen
 * off; the 4,893,000 ៛ sale of 09:45 was never announced). Inside the SoundBox's foreground service: every 4 s it asks
 * /api/soundbox/feed (the device's token) for new sales of its workspace and plays each one — the chime, then its Khmer
 * clips (the server picks them) — through MediaPlayer, one after another. The phone's quiet settings first (Task #476 —
 * PhoneQuiet): Silent / Do Not Disturb → no sound; Vibrate → a vibration. What it did is sent back, kept with the sale.
 *
 * Task #492 (24/10/2026 — the 600,000 ៛ sale of 14:42 «played» yet unheard): the media volume like the page and its
 * «សាកស្ដាប់» button (the notification volume before — a phone whose ringtone was low stayed silent); a sound counts as
 * played only when it ended without an error; the report carries the volume; the token in a header, never in the URL (it
 * reached the server's access log); every good poll timed for the service's watchdog.
 */
final class SoundboxFeed implements Runnable {
    private static final long POLL_MS = 4_000;

    private final Context context;
    private final String feedUrl;
    private final String device;
    private final String token;
    private final String speed;
    private final String voice;
    private volatile boolean running = true;
    private String cursor;
    private final Set<String> done = new LinkedHashSet<>();
    private Thread thread;
    /** The last poll the server answered (the watchdog restarts a feed silent for 30 s — SoundboxKeepAliveService). */
    private volatile long lastOkAt = System.currentTimeMillis();

    SoundboxFeed(Context context, String feedUrl, String device, String token, String speed, String voice) {
        this.context = context.getApplicationContext();
        this.feedUrl = feedUrl;
        this.device = device;
        this.token = token;
        this.speed = speed == null ? "1.2" : speed;
        // 👩 / 👨 (Task #509): the server answers with that voice's clips.
        this.voice = voice == null ? "female" : voice;
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        this.cursor = iso.format(new Date()); // never a sale from before the feed started
    }

    void start() {
        thread = new Thread(this, "soundbox-feed");
        thread.start();
    }

    void stop() {
        running = false;
        if (thread != null) thread.interrupt();
    }

    long lastOkAt() {
        return lastOkAt;
    }

    boolean alive() {
        return thread != null && thread.isAlive();
    }

    @Override
    public void run() {
        while (running) {
            try {
                poll();
            } catch (Throwable ignored) {
                // a network blip (or worse): asked again in a moment; the watchdog restarts a feed that stays silent
            }
            try {
                Thread.sleep(POLL_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void poll() throws Exception {
        String url = feedUrl + "?d=" + enc(device) + "&since=" + enc(cursor) + "&speed=" + enc(speed) + "&voice=" + enc(voice);
        JSONObject answer = new JSONObject(get(url, token));
        if (!answer.optBoolean("ok")) return;
        lastOkAt = System.currentTimeMillis();
        cursor = answer.optString("cursor", cursor);
        JSONArray items = answer.optJSONArray("items");
        if (items == null) return;
        for (int i = 0; i < items.length() && running; i++) {
            JSONObject item = items.getJSONObject(i);
            String id = item.optString("id");
            if (id.isEmpty() || done.contains(id)) continue;
            done.add(id);
            if (done.size() > 100) done.remove(done.iterator().next());
            announce(id, item.optJSONArray("clips"));
        }
    }

    private void announce(String id, JSONArray clips) {
        String phone = PhoneQuiet.mode(context);
        String log;
        if ("silent".equals(phone)) {
            log = "phone:silent";
        } else if ("vibrate".equals(phone)) {
            PhoneQuiet.vibrate(context);
            log = "phone:vibrate";
        } else {
            boolean chime = play(Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.payment_received));
            int played = 0;
            int total = clips == null ? 0 : clips.length();
            for (int i = 0; i < total && running; i++) {
                File f = clip(clips.optString(i));
                if (f != null && play(Uri.fromFile(f))) played++;
            }
            log = (chime ? "chime " : "no-chime ") + "km:clips " + played + "/" + total;
        }
        log += " vol:" + volume() + " wd:" + SoundboxKeepAliveService.watchdogRestarts;
        ack(id, log);
    }

    /** The media volume now, «7/15» — what the phone's speaker had for this sale. */
    private String volume() {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return "?";
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC) + "/" + audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
    }

    /** One sound to its end (at most 15 s); true only when it ended without an error. */
    private boolean play(Uri uri) {
        MediaPlayer player = new MediaPlayer();
        CountDownLatch ended = new CountDownLatch(1);
        AtomicBoolean failed = new AtomicBoolean(false);
        try {
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
            player.setDataSource(context, uri);
            player.setOnCompletionListener((mp) -> ended.countDown());
            player.setOnErrorListener((mp, what, extra) -> {
                failed.set(true);
                ended.countDown();
                return true;
            });
            player.prepare();
            player.start();
            return ended.await(15, TimeUnit.SECONDS) && !failed.get();
        } catch (Exception e) {
            return false;
        } finally {
            player.release();
        }
    }

    /** The clip, fetched once into the cache (the 27 clips are small). */
    private File clip(String url) {
        if (url == null || !url.startsWith("https://app.luychlat.com/")) return null;
        File dir = new File(context.getCacheDir(), "soundbox-clips");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File f = new File(dir, url.substring("https://app.luychlat.com/".length()).replaceAll("[^A-Za-z0-9._-]", "_"));
        if (f.exists() && f.length() > 0) return f;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setUseCaches(false);
            if (conn.getResponseCode() != 200) return null;
            File part = new File(dir, f.getName() + ".part");
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[16 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            return part.renameTo(f) ? f : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void ack(String id, String log) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("d", device);
            body.put("t", token);
            body.put("event", id);
            body.put("log", log);
            conn = (HttpURLConnection) new URL(feedUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("X-Soundbox-Token", token);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes("UTF-8"));
            }
            conn.getResponseCode();
        } catch (Exception ignored) {
            // the report is a nicety: the sale was announced either way
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String get(String url, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestProperty("X-Soundbox-Token", token);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setUseCaches(false);
            InputStream in = conn.getResponseCode() == 200 ? conn.getInputStream() : conn.getErrorStream();
            if (in == null) return "{}";
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8 * 1024];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            in.close();
            return out.toString("UTF-8");
        } finally {
            conn.disconnect();
        }
    }

    private static String enc(String s) throws Exception {
        return URLEncoder.encode(s == null ? "" : s, "UTF-8");
    }
}
