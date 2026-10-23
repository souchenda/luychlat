package com.luychlat.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page's handle on the SoundBox keep-alive (Task #473 — src/lib/native-keepalive.ts): start / stop the foreground
 * service, and the battery-optimisation exemption («Allow unrestricted background battery») the counter phone needs.
 */
@CapacitorPlugin(name = "SoundboxKeepAlive")
public class SoundboxKeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), SoundboxKeepAliveService.class);
        intent.putExtra("title", call.getString("title"));
        intent.putExtra("body", call.getString("body"));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("start_failed", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), SoundboxKeepAliveService.class));
        call.resolve();
    }

    /** «normal», «vibrate» or «silent» (Do Not Disturb counts as silent) — the SoundBox speaks only on normal (Task #476). */
    @PluginMethod
    public void ringerMode(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mode", PhoneQuiet.mode(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ignoring", ignoringBatteryOptimizations());
        call.resolve(result);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || ignoringBatteryOptimizations()) {
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Some phones hide the direct prompt: the battery-optimisation list instead.
            Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(list);
        }
        call.resolve();
    }

    private boolean ignoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
}
