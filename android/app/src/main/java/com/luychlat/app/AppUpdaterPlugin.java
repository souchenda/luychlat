package com.luychlat.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The app updates itself (founder, 23/10/2026 — Task #478): no trip to Chrome, its download bar and file manager. The
 * new APK is downloaded inside the app into its cache folder (progress events for the Khmer progress sheet), then
 * Android's own installer opens on it through the FileProvider — the one confirmation the person sees. «Install unknown
 * apps» is asked once (canRequestPackageInstalls / the app's own settings page); Android remembers it.
 * Only https://app.luychlat.com files are fetched (src/lib/apk-version.ts gives the path).
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String HOST = "app.luychlat.com";
    private static final String FILE_NAME = "LuyChlat-update.apk";

    /** Whether Android lets the app open the installer (Android 8+ asks once per app). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    /** The app's «Install unknown apps» switch. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** { url } → the file in the cache folder; «progress» events { percent }; resolves { path, bytes }. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        final URL target;
        try {
            target = new URL(url);
        } catch (Exception e) {
            call.reject("bad_url");
            return;
        }
        if (!"https".equals(target.getProtocol()) || !HOST.equals(target.getHost())) {
            call.reject("not_our_file");
            return;
        }
        new Thread(() -> {
            File out = new File(getContext().getCacheDir(), FILE_NAME);
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) target.openConnection();
                conn.setConnectTimeout(20_000);
                conn.setReadTimeout(30_000);
                conn.connect();
                if (conn.getResponseCode() != 200) {
                    call.reject("http_" + conn.getResponseCode());
                    return;
                }
                long total = conn.getContentLengthLong();
                long done = 0;
                int last = -1;
                try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buffer = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buffer)) != -1) {
                        os.write(buffer, 0, n);
                        done += n;
                        int percent = total > 0 ? (int) (done * 100 / total) : -1;
                        if (percent != last) {
                            last = percent;
                            JSObject p = new JSObject();
                            p.put("percent", percent);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (total > 0 && done != total) {
                    out.delete();
                    call.reject("incomplete");
                    return;
                }
                JSObject result = new JSObject();
                result.put("path", out.getAbsolutePath());
                result.put("bytes", done);
                call.resolve(result);
            } catch (Exception e) {
                out.delete();
                call.reject("download_failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /** Android's installer on the downloaded file — its single «Install» confirmation. */
    @PluginMethod
    public void install(PluginCall call) {
        File file = new File(getContext().getCacheDir(), FILE_NAME);
        if (!file.exists()) {
            call.reject("no_file");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("no_installer", e);
        }
    }
}
