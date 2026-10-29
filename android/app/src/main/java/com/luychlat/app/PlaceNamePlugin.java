package com.luychlat.app;

import android.location.Address;
import android.location.Geocoder;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Locale;

/**
 * Where the phone is, by name (founder, 29/10/2026 — «show កួរស្រូវ, as my Samsung does»): Android's own Geocoder — the
 * phone's map service, which the system already uses for its location — turns the GPS fix into the area, sangkat / khum,
 * khan / srok and province, in Khmer, English or Chinese. The fix never reaches our server; the page keeps only the name.
 * found:false when the phone has no geocoder or no answer — the page falls back to the nearest named place it knows.
 */
@CapacitorPlugin(name = "PlaceName")
public class PlaceNamePlugin extends Plugin {

    @PluginMethod
    public void lookup(PluginCall call) {
        final Double lat = call.getDouble("lat");
        final Double lng = call.getDouble("lng");
        final String lang = call.getString("lang", "km");
        if (lat == null || lng == null || !Geocoder.isPresent()) {
            notFound(call);
            return;
        }
        final Locale locale = "en".equals(lang) ? Locale.ENGLISH : "zh".equals(lang) ? Locale.SIMPLIFIED_CHINESE : new Locale("km", "KH");
        final Geocoder geocoder = new Geocoder(getContext().getApplicationContext(), locale);
        if (Build.VERSION.SDK_INT >= 33) {
            geocoder.getFromLocation(lat, lng, 1, new Geocoder.GeocodeListener() {
                @Override
                public void onGeocode(List<Address> addresses) {
                    answer(call, addresses);
                }

                @Override
                public void onError(String message) {
                    notFound(call);
                }
            });
            return;
        }
        // Older Android: the blocking call, off the main thread.
        new Thread(() -> {
            try {
                @SuppressWarnings("deprecation")
                List<Address> addresses = geocoder.getFromLocation(lat, lng, 1);
                answer(call, addresses);
            } catch (Exception e) {
                notFound(call);
            }
        }).start();
    }

    private void answer(PluginCall call, List<Address> addresses) {
        if (addresses == null || addresses.isEmpty()) {
            notFound(call);
            return;
        }
        Address a = addresses.get(0);
        JSObject r = new JSObject();
        r.put("found", true);
        r.put("feature", nz(a.getFeatureName()));
        r.put("subLocality", nz(a.getSubLocality()));
        r.put("locality", nz(a.getLocality()));
        r.put("subAdminArea", nz(a.getSubAdminArea()));
        r.put("adminArea", nz(a.getAdminArea()));
        r.put("country", nz(a.getCountryCode()));
        call.resolve(r);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private void notFound(PluginCall call) {
        JSObject r = new JSObject();
        r.put("found", false);
        call.resolve(r);
    }
}
