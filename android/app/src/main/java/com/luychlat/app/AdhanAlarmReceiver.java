package com.luychlat.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * A prayer alarm fired (AdhanAlarmPlugin). With the Adhan chosen: AdhanPlayerService plays it out loud on the ALARM stream
 * (Task #475 — heard on silent / vibrate) with its own notification. With the chime or silent, or if Android refuses the
 * player: the notification on the prayer channel (the Adhan channel's own sound, the chime, or none). A tap opens the app.
 */
public class AdhanAlarmReceiver extends BroadcastReceiver {
    static final String ADHAN_CHANNEL = "prayer_adhan_v1";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String channelId = intent.getStringExtra("channelId");
        if (channelId == null || channelId.isEmpty()) channelId = ADHAN_CHANNEL;

        if (ADHAN_CHANNEL.equals(channelId)) {
            Intent play = new Intent(context, AdhanPlayerService.class).setAction(AdhanPlayerService.ACTION_PLAY);
            play.putExtra("title", title);
            play.putExtra("body", body);
            try {
                // An exact alarm may start a foreground service from the background (Android 12+ exemption).
                ContextCompat.startForegroundService(context, play);
                return;
            } catch (Exception refused) {
                // The notification below rings with the Adhan channel's sound instead.
            }
        }

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_prayer)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(tap);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(id, builder.build());
    }
}
