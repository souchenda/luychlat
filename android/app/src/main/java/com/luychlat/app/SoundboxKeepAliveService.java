package com.luychlat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * The SoundBox kept awake with the screen locked (founder, 23/10/2026 — Task #473): while the SoundBox or the counter
 * mode is on, a foreground service with a quiet, persistent notification keeps the app's process from being frozen
 * (Android's cached-app freezer held the payment events up to 20 minutes, the sounds bursting out at unlock), and a
 * partial wake lock keeps the CPU running so the live connection and the announcement are not put to sleep.
 * Started and stopped by the page (SoundboxKeepAlivePlugin); nothing here reads payments or money.
 */
public class SoundboxKeepAliveService extends Service {
    static final String CHANNEL_ID = "soundbox_keepalive_v1";
    static final int NOTIFICATION_ID = 4242;
    /** Renewed at every start; a counter phone left on for days re-takes it when the page asks again. */
    private static final long WAKE_LOCK_MS = 12L * 60 * 60 * 1000;

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

        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            if (power != null) {
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "luychlat:soundbox");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null) wakeLock.acquire(WAKE_LOCK_MS);

        String action = intent != null ? intent.getAction() : null;
        if (ACTION_FEED_START.equals(action)) {
            if (feed != null) feed.stop();
            feed = new SoundboxFeed(this, intent.getStringExtra("feedUrl"), intent.getStringExtra("device"), intent.getStringExtra("token"), intent.getStringExtra("speed"));
            feed.start();
        } else if (ACTION_FEED_STOP.equals(action) && feed != null) {
            feed.stop();
            feed = null;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
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
