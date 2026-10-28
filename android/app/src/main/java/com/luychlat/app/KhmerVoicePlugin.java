package com.luychlat.app;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * The phone's own Khmer voice (founder, 28/10/2026 — «DL Staff sounds natural»): Android's Text-to-Speech (Google's Khmer
 * voice on most phones), as DL Staff's driver app speaks. The page says what to speak, at the speed and pitch it chooses,
 * on the media stream (the volume keys rule it). spoken:false when the phone has no Khmer voice — the page plays its
 * recorded clip then (src/lib/khmer-voice.ts). Licensed by the phone itself: nothing is fetched from anywhere.
 */
@CapacitorPlugin(name = "KhmerVoice")
public class KhmerVoicePlugin extends Plugin {

    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final float rate = (float) Math.max(0.5, Math.min(2.0, call.getDouble("rate", 1.0)));
        final float pitch = (float) Math.max(0.5, Math.min(2.0, call.getDouble("pitch", 1.0)));
        final float volume = (float) Math.max(0.0, Math.min(1.0, call.getDouble("volume", 1.0)));
        if (text == null || text.isEmpty()) {
            JSObject r = new JSObject();
            r.put("spoken", false);
            call.resolve(r);
            return;
        }
        final Locale km = new Locale("km", "KH");
        final TextToSpeech[] holder = new TextToSpeech[1];
        holder[0] = new TextToSpeech(getContext().getApplicationContext(), status -> {
            final TextToSpeech t = holder[0];
            JSObject r = new JSObject();
            if (status != TextToSpeech.SUCCESS || t == null || t.isLanguageAvailable(km) < TextToSpeech.LANG_AVAILABLE) {
                if (t != null) t.shutdown();
                r.put("spoken", false);
                call.resolve(r);
                return;
            }
            t.setLanguage(km);
            t.setSpeechRate(rate);
            t.setPitch(pitch);
            t.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { t.shutdown(); }
                @Override public void onError(String id) { t.shutdown(); }
            });
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
            t.speak(text, TextToSpeech.QUEUE_FLUSH, params, "luychlat-voice");
            r.put("spoken", true);
            call.resolve(r);
        });
    }
}
