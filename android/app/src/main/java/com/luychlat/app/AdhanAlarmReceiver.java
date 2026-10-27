package com.luychlat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * A prayer alarm fired (AdhanAlarmPlugin). The phone's quiet settings first, always (Task #476 — PhoneQuiet): Silent or
 * Do Not Disturb → a silent notification; Vibrate → a vibration and a silent notification. A phone on normal: the Adhan
 * through AdhanPlayerService at the phone's own notification volume, or the notification on the chosen prayer channel
 * (the chime's sound). The person's own choice in the app (vibrate / silent) is respected the same way.
 */
public class AdhanAlarmReceiver extends BroadcastReceiver {
    static final String ADHAN_CHANNEL = "prayer_adhan_v1";
    static final String VIBRATE_CHANNEL = "prayer_vibrate_v1";
    static final String SILENT_CHANNEL = "prayer_silent_v1";
    /** No sound of its own (the player's, or none): the channel for the notification of a quiet prayer. */
    static final String QUIET_CHANNEL = "prayer_quiet_v1";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", 0);
        // Turned off on this phone (Task #494) or Islamic Mode off (the gate, Task #525): silent, never a stray Adhan.
        if (!AdhanAlarmPlugin.planned(context, id)) return;
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String channelId = intent.getStringExtra("channelId");
        if (channelId == null || channelId.isEmpty()) channelId = ADHAN_CHANNEL;

        String phone = PhoneQuiet.mode(context);
        boolean silent = "silent".equals(phone) || SILENT_CHANNEL.equals(channelId);
        boolean vibrate = !silent && ("vibrate".equals(phone) || VIBRATE_CHANNEL.equals(channelId));

        if (silent || vibrate) {
            if (vibrate) PhoneQuiet.vibrate(context);
            notify(context, id, QUIET_CHANNEL, title, body);
            return;
        }

        if (ADHAN_CHANNEL.equals(channelId)) {
            Intent play = new Intent(context, AdhanPlayerService.class).setAction(AdhanPlayerService.ACTION_PLAY);
            play.putExtra("title", title);
            play.putExtra("body", body);
            try {
                // An exact alarm may start a foreground service from the background (Android 12+ exemption).
                ContextCompat.startForegroundService(context, play);
                return;
            } catch (Exception refused) {
                // The notification below rings with the Adhan channel's sound instead (a notification sound: the ringer decides).
            }
        }
        notify(context, id, channelId, title, body);
    }

    /** The quiet channel: high importance (shown on the lock screen), never a sound or a vibration of its own. */
    static void ensureQuietChannel(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager == null) return;
        NotificationChannel channel = new NotificationChannel(QUIET_CHANNEL, "Prayer Times (quiet)", NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    static void notify(Context context, int id, String channelId, String title, String body) {
        if (QUIET_CHANNEL.equals(channelId)) ensureQuietChannel(context);
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_prayer)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(tap);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(id, builder.build());
    }
}
