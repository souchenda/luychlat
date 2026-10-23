package com.luychlat.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The SoundBox keep-alive (Task #473): registered before the bridge starts.
        registerPlugin(SoundboxKeepAlivePlugin.class);
        // The Adhan as an alarm clock (Task #474).
        registerPlugin(AdhanAlarmPlugin.class);
        // The app updates itself, no trip to Chrome (Task #478).
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // A WebView has no downloads of its own: a download link (the app's own update, /downloads/LuyChlat-v….apk —
        // Task #468) opens in the phone's browser, which downloads it and hands it to the package installer.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(open);
            } catch (ActivityNotFoundException ignored) {
                // No browser on the phone: nothing to open.
            }
        });
    }
}
