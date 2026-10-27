package com.luychlat.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Adhan as a real alarm clock (founder, 23/10/2026 — Task #474: the 10 s lock-screen test on 1.5 never rang).
 * AlarmManager.setAlarmClock — what clock apps use: never deferred by Doze, the least likely to be held by a phone
 * maker's battery manager, the alarm icon in the status bar — fires AdhanAlarmReceiver, which posts the notification on
 * the prayer channel (its sound is the Adhan). The alarms are kept in SharedPreferences and set again after a reboot
 * (AdhanBootReceiver). Used from 1.6 by src/lib/native-prayer.ts; 1.5 keeps the local-notifications plugin.
 */
@CapacitorPlugin(name = "AdhanAlarm")
public class AdhanAlarmPlugin extends Plugin {
    static final String PREFS = "luychlat_adhan_alarms";
    static final String KEY = "alarms";
    /**
     * The gate (founder, 27/10/2026 — Task #525: at Asr the Adhan rang with Islamic Mode OFF): true only while the app
     * says this phone's prayer switch AND Islamic Mode are on (lib/native-prayer.ts › setGate). Closed — or never set,
     * as after an update from an older build — no prayer alarm sounds and every one is cancelled when the app starts.
     */
    static final String GATE = "gate";

    /** The app starts: a closed gate cancels every prayer alarm at once, before any could fire. */
    @Override
    public void load() {
        Context context = getContext();
        if (!gateOpen(context)) purge(context);
    }

    /** { on } — opened just before a plan; closed by every cancel (the phone's switch or Islamic Mode turned off). */
    @PluginMethod
    public void setGate(PluginCall call) {
        Context context = getContext();
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        prefs(context).edit().putBoolean(GATE, on).apply();
        if (!on) purge(context);
        call.resolve();
    }

    static boolean gateOpen(Context context) {
        return prefs(context).getBoolean(GATE, false);
    }

    /** Every prayer alarm cancelled and the plan forgotten. */
    static void purge(Context context) {
        cancelAll(context);
        prefs(context).edit().remove(KEY).apply();
    }

    /** { alarms: [{ id, at (ms), title, body, channelId }] } — replaces every alarm planned before. */
    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray alarms = call.getArray("alarms", new JSArray());
        Context context = getContext();
        cancelAll(context);
        JSONArray kept = new JSONArray();
        boolean exact = canScheduleExact(context);
        try {
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.getJSONObject(i);
                if (a.getLong("at") <= System.currentTimeMillis()) continue;
                set(context, a, exact);
                kept.put(a);
            }
        } catch (JSONException e) {
            call.reject("bad_alarms", e);
            return;
        }
        prefs(context).edit().putString(KEY, kept.toString()).apply();
        JSObject result = new JSObject();
        result.put("scheduled", kept.length());
        result.put("exact", exact);
        call.resolve(result);
    }

    /** One more alarm, keeping the others (the 10 s test). */
    @PluginMethod
    public void add(PluginCall call) {
        Context context = getContext();
        boolean exact = canScheduleExact(context);
        try {
            JSONObject a = new JSONObject();
            a.put("id", call.getInt("id"));
            a.put("at", call.getLong("at"));
            a.put("title", call.getString("title"));
            a.put("body", call.getString("body"));
            a.put("channelId", call.getString("channelId"));
            set(context, a, exact);
        } catch (JSONException e) {
            call.reject("bad_alarm", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("exact", exact);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAll(getContext());
        prefs(getContext()).edit().remove(KEY).apply();
        call.resolve();
    }

    /** Whether exact alarms and notifications are allowed — shown on the prayer card, never silently «on». */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("exact", canScheduleExact(getContext()));
        result.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    /** Android's «Alarms & reminders» switch for the app (Android 12+). */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms != null && alarms.canScheduleExactAlarms();
    }

    static PendingIntent fireIntent(Context context, JSONObject a) throws JSONException {
        Intent intent = new Intent(context, AdhanAlarmReceiver.class);
        intent.putExtra("id", a.getInt("id"));
        intent.putExtra("title", a.optString("title"));
        intent.putExtra("body", a.optString("body"));
        intent.putExtra("channelId", a.optString("channelId"));
        return PendingIntent.getBroadcast(context, a.getInt("id"), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** setAlarmClock when exact alarms are allowed; else the best Android gives (it may come a few minutes late). */
    static void set(Context context, JSONObject a, boolean exact) throws JSONException {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long at = a.getLong("at");
        PendingIntent fire = fireIntent(context, a);
        if (exact) {
            Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent show = open == null ? null : PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            alarms.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fire);
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        }
    }

    static void cancelAll(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        try {
            // The 10 s test too (never in the saved list), so nothing is left ringing.
            alarms.cancel(fireIntent(context, new JSONObject().put("id", TEST_ID)));
            String saved = prefs(context).getString(KEY, null);
            if (saved == null) return;
            JSONArray list = new JSONArray(saved);
            for (int i = 0; i < list.length(); i++) alarms.cancel(fireIntent(context, list.getJSONObject(i)));
        } catch (JSONException ignored) {
            // nothing readable to cancel
        }
    }

    /** The 10 s test's id (lib/native-prayer.ts › NATIVE_TEST_ID). */
    static final int TEST_ID = 199_999_999;

    /**
     * The hard guard of Task #494 (founder, 24/10/2026 — «zero tolerance»): an Adhan rings only if it is still in this
     * phone's plan. Turned off on this phone, the plan is gone (cancelAll), so a stray alarm that still fires — set by an
     * older build, or missed by a cancel — makes no sound. The 10 s test always rings (the person just tapped it).
     */
    static boolean planned(Context context, int id) {
        if (id == TEST_ID) return true;
        // Task #525: the gate first — Islamic Mode or the prayer switch off on this phone, nothing ever sounds.
        if (!gateOpen(context)) return false;
        String saved = prefs(context).getString(KEY, null);
        if (saved == null) return false;
        try {
            JSONArray list = new JSONArray(saved);
            for (int i = 0; i < list.length(); i++) if (list.getJSONObject(i).optInt("id") == id) return true;
        } catch (JSONException ignored) {
            // unreadable: nothing planned
        }
        return false;
    }

    /** After a reboot: the alarms still ahead, set again. */
    static void restore(Context context) {
        // Task #525: a closed gate is never restored after a reboot — the alarms are cancelled instead.
        if (!gateOpen(context)) {
            purge(context);
            return;
        }
        String saved = prefs(context).getString(KEY, null);
        if (saved == null) return;
        boolean exact = canScheduleExact(context);
        try {
            JSONArray list = new JSONArray(saved);
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.getJSONObject(i);
                if (a.getLong("at") > System.currentTimeMillis()) set(context, a, exact);
            }
        } catch (JSONException ignored) {
            // nothing readable to restore
        }
    }
}
