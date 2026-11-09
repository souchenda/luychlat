package com.luychlat.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * The page's side of BankNoticeListener (founder, 9/11/2026): is notification access on, open Android's settings to turn
 * it on or off (the person's own choice — the app cannot switch it), and hand over the queued bank notices.
 */
@CapacitorPlugin(name = "BankNotices")
public class BankNoticesPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", enabled());
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("no_settings");
        }
    }

    @PluginMethod
    public void drain(PluginCall call) {
        try {
            JSONArray queue = BankNoticeListener.drain(getContext());
            JSObject r = new JSObject();
            r.put("notices", new JSArray(queue.toString()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("drain_failed");
        }
    }

    private boolean enabled() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (flat == null) return false;
        String mine = new ComponentName(getContext(), BankNoticeListener.class).flattenToString();
        for (String part : flat.split(":")) {
            if (mine.equals(part)) return true;
        }
        return false;
    }
}
