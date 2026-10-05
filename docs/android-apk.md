# Android APK (LuyChlat.apk)

The Android app is a native shell made with Capacitor. It loads the live site (`https://luy.ibmserp.com`, set in `capacitor.config.ts`), so **every web deploy reaches installed apps at once**: testers never reinstall for web changes.

A new APK is only needed when `capacitor.config.ts`, the `android/` project, the icon or a native plugin changes. Before building it, raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

## One-time setup (the build machine)

1. Install **Android Studio** (latest). It includes the Android SDK and JDK 21, which Capacitor 8 needs. JDK 11 is too old.
2. Point the command line at them (Windows PowerShell; adjust the paths if you installed elsewhere):

   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   ```

   Alternatively, put `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` in `android/local.properties`. That file is not committed.
3. Install the project's packages: `npm install`.

## Build

```bash
npm run android:sync
```

Then build either version:

- **Debug APK.** Quick to make, and signed with this computer's debug key:

  ```bash
  cd android && ./gradlew assembleDebug
  ```

  Output: `android/app/build/outputs/apk/debug/LuyChlat-debug.apk`. On Windows `cmd`, use `gradlew.bat assembleDebug`.

- **Release APK.** Recommended for testers.

  ```bash
  cd android && ./gradlew assembleRelease
  ```

  Output: `android/app/build/outputs/apk/release/LuyChlat-release.apk`.

You can also run `npm run android:open` and use **Build › Build App Bundle(s) / APK(s) › Build APK(s)** in Android Studio.

### Why a release key for testers

Android only installs an update over an existing app when both APKs are signed with the **same key**.

- A debug key belongs to one computer. If the APK is ever built elsewhere, testers must uninstall first, which deletes the app's local data, including the PIN lock and guest data.
- A release key is yours to keep, so updates always install over the top.

Create it once:

```bash
keytool -genkeypair -v -keystore android/luychlat-release.jks -alias luychlat -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties`:

```properties
storeFile=luychlat-release.jks
storePassword=<the password you chose>
keyAlias=luychlat
keyPassword=<the password you chose>
```

Both files are git-ignored: keep them out of the repo. **Back them up.** If the keystore is lost, every tester has to uninstall before the next version can be installed.

## Installing on a phone

1. Send the APK (e.g. in Telegram).
2. On the phone, open it, and allow **Install unknown apps** for Telegram or Files when asked.

## Notes

- **Permissions**: Internet, plus Camera for photographing receipts, slips and loan documents. On Android 12 and older, it also asks to read photos. Android 13+ uses the system picker and needs no permission.
- **Sharing and downloads**: Android's WebView has no Web Share and ignores downloads. Inside the app, `src/lib/native-bridge.ts` sends both to Android's share sheet (Save to Files / Drive, Telegram, and so on). Browsers are unaffected.
- **Offline at launch**: shows `capacitor-www/index.html` ("no internet", with Retry).
- **Links outside the site** open in the phone's browser. This covers Telegram, bank pages and password-reset emails.
- **Google sign-in**: Google blocks sign-in inside embedded WebViews. If Google sign-in is turned on later, the app needs a browser-based sign-in flow first. Email sign-in works as is.
- **Icon / splash**: generated from `public/icons` with `npm run android:assets`. Run it again after changing the icon.
