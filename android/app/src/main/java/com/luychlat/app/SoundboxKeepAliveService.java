package com.luychlat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * The SoundBox kept awake with the screen locked (founder, 23/10/2026 — Task #473): while the SoundBox or the counter
 * mode is on, a foreground service with a quiet, persistent notification keeps the app's process from being frozen
 * (Android's cached-app freezer held the payment events up to 20 minutes, the sounds bursting out at unlock), and a
 * partial wake lock keeps the CPU running so the live connection and the announcement are not put to sleep.
 * Started and stopped by the page (SoundboxKeepAlivePlugin); nothing here reads payments or money.
 *
 * Task #492 (24/10/2026 — «it announces only when I pick the phone up»): the wake lock held until the SoundBox is turned
 * off (it lapsed after 12 h before); the feed's settings kept, so a service Android restarts (START_STICKY, no intent)
 * resumes the feed; a watchdog every 10 s — a feed with no answered poll for 30 s, or whose thread died, gets the wake lock
 * re-taken and a fresh feed (counted in every report: «wd:N»).
 */
public class SoundboxKeepAliveService extends Service {
    static final String CHANNEL_ID = "soundbox_keepalive_v1";
    static final int NOTIFICATION_ID = 4242;
    private static final long WATCHDOG_MS = 10_000;
    private static final long SILENT_MS = 30_000;
    private static final String PREFS = "soundbox_feed";
    /** How often the watchdog restarted the feed since the app started (in each report). */
    static volatile int watchdogRestarts = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            SoundboxFeed f = feed;
            if (f != null && (!f.alive() || System.currentTimeMillis() - f.lastOkAt() > SILENT_MS)) {
                holdWakeLock();
                f.stop();
                feed = savedFeed();
                if (feed != null) feed.start();
                watchdogRestarts++;
            }
            handler.postDelayed(this, WATCHDOG_MS);
        }
    };

    private PowerManager.WakeLock wakeLock;
    /** The native feed (Task #487): the sales announced by the service itself, while the page asked for it. */
    private SoundboxFeed feed;
    static final String ACTION_FEED_START = "com.luychlat.app.SOUNDBOX_FEED_START";
    static final String ACTION_FEED_STOP = "com.luychlat.app.SOUNDBOX_FEED_STOP";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "លុយឆ្លាត SoundBox កំពុងដំណើរការ";
        String body = intent != null && intent.getStringExtra("body") != null ? intent.getStringExtra("body") : "កំពុងរង់ចាំទទួលដំណឹងទូទាត់ប្រាក់...";

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SoundBox", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("SoundBox listening for payments");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.ic_stat_soundbox)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(tap)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        holdWakeLock();

        String action = intent != null ? intent.getAction() : null;
        if (ACTION_FEED_START.equals(action)) {
            if (feed != null) feed.stop();
            prefs().edit()
                .putString("feedUrl", intent.getStringExtra("feedUrl"))
                .putString("device", intent.getStringExtra("device"))
                .putString("token", intent.getStringExtra("token"))
                .putString("speed", intent.getStringExtra("speed"))
                .apply();
            feed = savedFeed();
            if (feed != null) feed.start();
        } else if (ACTION_FEED_STOP.equals(action)) {
            prefs().edit().clear().apply();
            if (feed != null) feed.stop();
            feed = null;
        } else if (intent == null && feed == null) {
            // Restarted by Android after it stopped the service: the feed the SoundBox asked for, as it was.
            feed = savedFeed();
            if (feed != null) feed.start();
        }
        handler.removeCallbacks(watchdog);
        handler.postDelayed(watchdog, WATCHDOG_MS);
        return START_STICKY;
    }

    /** The partial wake lock, held until the SoundBox is turned off (onDestroy) — never on a timer. */
    private void holdWakeLock() {
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            if (power != null) {
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "luychlat:soundbox");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** A feed from the saved settings; null when the SoundBox asked for none. */
    private SoundboxFeed savedFeed() {
        SharedPreferences p = prefs();
        String url = p.getString("feedUrl", null);
        String device = p.getString("device", null);
        String token = p.getString("token", null);
        if (url == null || device == null || token == null) return null;
        return new SoundboxFeed(this, url, device, token, p.getString("speed", "1.2"));
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(watchdog);
        if (feed != null) feed.stop();
        feed = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
