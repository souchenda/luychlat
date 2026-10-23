package com.luychlat.app;

import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * The phone's own quiet settings, always respected (founder, 23/10/2026 — Task #476: a loud Adhan or SoundBox through
 * Silent / Vibrate in a meeting or a classroom makes people uninstall). «silent» — the ringer on silent, or Do Not
 * Disturb on: no sound, no vibration. «vibrate» — a vibration, no sound. «normal» — sound at the phone's own volume.
 */
final class PhoneQuiet {
    private PhoneQuiet() {}

    static String mode(Context context) {
        NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notifications != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && notifications.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL
            && notifications.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
            return "silent";
        }
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return "normal";
        switch (audio.getRingerMode()) {
            case AudioManager.RINGER_MODE_SILENT:
                return "silent";
            case AudioManager.RINGER_MODE_VIBRATE:
                return "vibrate";
            default:
                return "normal";
        }
    }

    /** A short double buzz — the prayer's vibration. */
    static void vibrate(Context context) {
        Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 500, 250, 500, 250, 800};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
    }
}
