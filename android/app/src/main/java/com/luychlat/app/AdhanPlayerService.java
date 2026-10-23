package com.luychlat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * The Adhan played out loud at the prayer minute (founder, 23/10/2026 — Task #475): started by AdhanAlarmReceiver when
 * an alarm-clock alarm fires (Android lets an exact alarm start a foreground service from the background). The bundled
 * recording (res/raw/adhan.mp3) plays through MediaPlayer on the ALARM stream (USAGE_ALARM) — heard with the phone on
 * silent or vibrate, and through Do Not Disturb unless alarms are blocked there — with a partial wake lock while it
 * plays. Its notification (a silent channel: the sound is the player's, never twice) carries «🔇 បិទសំឡេង».
 */
public class AdhanPlayerService extends Service {
    static final String ACTION_PLAY = "com.luychlat.app.ADHAN_PLAY";
    static final String ACTION_STOP = "com.luychlat.app.ADHAN_STOP";
    static final String CHANNEL_ID = "prayer_alarm_v1";
    static final int NOTIFICATION_ID = 4343;
    /** The longest Adhan, with room: the wake lock never outlives the recording by much. */
    private static final long WAKE_LOCK_MS = 6L * 60 * 1000;

    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String title = intent != null ? intent.getStringExtra("title") : null;
        String body = intent != null ? intent.getStringExtra("body") : null;
        startForegroundWith(title != null ? title : "🕌", body != null ? body : "");
        play();
        return START_NOT_STICKY;
    }

    private void startForegroundWith(String title, String body) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Prayer Times Alarm", NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(null, null); // the player is the sound
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, AdhanPlayerService.class).setAction(ACTION_STOP);
        PendingIntent stopTap = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_prayer)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap)
            .setDeleteIntent(stopTap)
            .addAction(0, "🔇 បិទសំឡេង", stopTap)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void play() {
        releasePlayer();
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power != null && wakeLock == null) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "luychlat:adhan");
            wakeLock.setReferenceCounted(false);
        }
        if (wakeLock != null) wakeLock.acquire(WAKE_LOCK_MS);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.adhan));
            player.setVolume(1f, 1f);
            player.setOnCompletionListener((mp) -> stopSelf());
            player.setOnErrorListener((mp, what, extra) -> {
                stopSelf();
                return true;
            });
            player.prepare();
            player.start();
        } catch (Exception e) {
            stopSelf();
        }
    }

    private void releasePlayer() {
        if (player != null) {
            try {
                player.stop();
            } catch (IllegalStateException ignored) {
                // not started
            }
            player.release();
            player = null;
        }
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
