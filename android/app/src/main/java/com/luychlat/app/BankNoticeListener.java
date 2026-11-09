package com.luychlat.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Money in and out from the bank apps' own notifications (founder, 9/11/2026 — «no AUTOBOK, no Telegram group: just the
 * phone»). Runs only after the person turns on «Notification access» for the app in Android's settings, and switches it
 * off there at any time.
 *
 * What it keeps, and where: only a notification from a bank or wallet app (its package name, BANK_APP) that mentions an
 * amount (MONEY) — every other app's notification is never read past its package name. It is queued on the phone (at most
 * MAX, private app storage) until the app's page reads and clears it (BankNoticesPlugin.drain); the page parses it
 * (lib/bot/bank-alert.ts) and records it in the person's own wallet. Nothing here sends anything anywhere.
 */
public class BankNoticeListener extends NotificationListenerService {
    static final String PREFS = "bank_notices";
    static final String KEY = "queue";
    static final int MAX = 100;

    // Cambodian banks and wallets, by a word in their app's package name. Over-inclusive is safe: a notice is recorded only
    // when the page's parser finds an account, an amount and in / out in it.
    static final Pattern BANK_APP = Pattern.compile(
        "(aba|acleda|ppcb|ppcbank|wing|bakong|canadia|sathapana|prince|chipmong|prasac|amret|truemoney|hattha|vattanac|"
            + "ftb|cpbank|maybank|cimb|bred|amkb|amk|woori|shinhan|phillip|kbprasac|lolc|sacombank|jtrust|mohanokor|bic)",
        Pattern.CASE_INSENSITIVE);
    static final Pattern MONEY = Pattern.compile("(USD|KHR|\\$|៛|riel)", Pattern.CASE_INSENSITIVE);

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName()) || !BANK_APP.matcher(pkg).find()) return;
            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;
            String title = str(extras.getCharSequence(Notification.EXTRA_TITLE));
            CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String text = str(big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT));
            if (text.isEmpty() || !MONEY.matcher(title + " " + text).find()) return;
            add(this, pkg, title, text, sbn.getPostTime());
        } catch (Exception ignored) {
            // A notification we cannot read is skipped, never the app.
        }
    }

    private static String str(CharSequence s) {
        return s == null ? "" : s.toString().trim();
    }

    static synchronized void add(Context ctx, String pkg, String title, String text, long time) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray queue = new JSONArray(prefs.getString(KEY, "[]"));
        // The same notice posted again (an app re-posting it): kept once.
        for (int i = 0; i < queue.length(); i++) {
            JSONObject o = queue.getJSONObject(i);
            if (pkg.equals(o.optString("pkg")) && text.equals(o.optString("text")) && Math.abs(time - o.optLong("time")) < 600_000) return;
        }
        JSONObject item = new JSONObject();
        item.put("pkg", pkg);
        item.put("title", title);
        item.put("text", text);
        item.put("time", time);
        queue.put(item);
        while (queue.length() > MAX) queue.remove(0);
        prefs.edit().putString(KEY, queue.toString()).apply();
    }

    /** Every queued notice, oldest first, and the queue emptied. */
    static synchronized JSONArray drain(Context ctx) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray queue = new JSONArray(prefs.getString(KEY, "[]"));
        prefs.edit().putString(KEY, "[]").apply();
        return queue;
    }
}
