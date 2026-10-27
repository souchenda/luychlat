// Where people get «អេប លុយឆ្លាត» (founder, 27/10/2026 — Task #527: «the right link is app.luychlat.com/download»): one
// public page — the Android APK with its install steps, iPhone / Web, the Telegram bot and a QR code of the page — shared
// in posts, chats and on shop posters instead of the raw .apk file. Until the Google Play launch (ROADMAP §6), the APK is
// the Android way. Pure (download-links.test.ts); the page is src/app/download/.

import { LATEST_APK } from "@/lib/apk-version"

export const DOWNLOAD_PAGE_URL = "https://app.luychlat.com/download"
/** Always the newest build (deploy/build-apk.sh keeps it). */
export const ANDROID_APK_PATH = "/LuyChlat.apk"
export const WEB_APP_URL = "https://app.luychlat.com"
export const BOT_URL = "https://t.me/luychlat_bot"

type Copy = {
  title: string
  lead: string
  android: { title: string; button: string; steps: string[]; note: string }
  iphone: { title: string; button: string; steps: string[] }
  bot: { title: string; text: string; button: string }
  qr: string
}

export const DOWNLOAD_COPY: Record<"km" | "en", Copy> = {
  km: {
    title: "ទាញយក អេប លុយឆ្លាត",
    lead: "គ្រប់គ្រងលុយហាង និងលុយគ្រួសារ ក្នុងដៃតែមួយ។",
    android: {
      title: "📱 Android",
      button: `ទាញយក APK (កំណែ ${LATEST_APK.version})`,
      steps: [
        "ចុច «ទាញយក APK» ហើយរង់ចាំឯកសារ LuyChlat.apk ទាញយករួច។",
        "បើកឯកសារនោះ។ បើទូរសព្ទសួរ «Install unknown apps» ចុច Settings ហើយបើក «Allow from this source» រួចត្រឡប់មកវិញ។",
        "ចុច Install រួច Open ហើយចូលគណនីរបស់អ្នក។",
      ],
      note: "ដំឡើងតែមួយគត់ — កុំដំឡើងម្ដងទៀតក្នុង Secure Folder ឬ Dual App ព្រោះវាមានការកំណត់ដាច់ដោយឡែក។",
    },
    iphone: {
      title: "🍎 iPhone និងកុំព្យូទ័រ",
      button: "បើក អេប លុយឆ្លាត",
      steps: ["បើក app.luychlat.com ក្នុង Safari។", "ចុច Share រួច «Add to Home Screen» — រូបអេបនឹងនៅលើអេក្រង់ដើម។"],
    },
    bot: { title: "🤖 Telegram Bot", text: "កត់ចំណាយ និងចំណូល ដោយផ្ញើសារ ឬសំឡេង។", button: "បើក @luychlat_bot" },
    qr: "ស្កេនដើម្បីបើកទំព័រនេះ",
  },
  en: {
    title: "Get App Luy Chlat",
    lead: "Your shop's money and your family's money, in one hand.",
    android: {
      title: "📱 Android",
      button: `Download APK (version ${LATEST_APK.version})`,
      steps: [
        "Tap «Download APK» and wait for LuyChlat.apk to finish downloading.",
        "Open the file. If the phone asks about «Install unknown apps», tap Settings, turn on «Allow from this source» and come back.",
        "Tap Install, then Open, and sign in.",
      ],
      note: "Install it once only — not again in Secure Folder or Dual App, which keep their own settings.",
    },
    iphone: {
      title: "🍎 iPhone and computer",
      button: "Open App Luy Chlat",
      steps: ["Open app.luychlat.com in Safari.", "Tap Share, then «Add to Home Screen» — the app's icon goes on your home screen."],
    },
    bot: { title: "🤖 Telegram Bot", text: "Record spending and income by message or voice.", button: "Open @luychlat_bot" },
    qr: "Scan to open this page",
  },
}
