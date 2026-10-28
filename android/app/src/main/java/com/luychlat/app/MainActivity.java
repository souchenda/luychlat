package com.luychlat.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

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
        // The phone's own Khmer voice for the spoken greeting (founder, 28/10/2026 — as DL Staff speaks).
        registerPlugin(KhmerVoicePlugin.class);
        super.onCreate(savedInstanceState);
        // The page keeps running with the screen off (founder, 24/10/2026 — Task #486: a 1,710,000 ៛ sale announced 4 min
        // late, at unlock). The WebView's JavaScript runs in its own renderer process, whose priority the WebView lowers
        // when the app is not visible — Android then froze it within minutes, the foreground service notwithstanding.
        // «Important», even when not visible: the SoundBox and the Adhan's page stay awake while the service runs.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getBridge().getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
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
