"use client"

import { ArrowLeftIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import { useAboutInfo } from "@/lib/app-info"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"

/** Last change to the text below; shown on the page. */
const UPDATED = "2026-10-02"

type Section = { title: string; points: string[] }

// Plain-language terms and privacy notice, matching how the app actually works.
const SECTIONS: Record<"km" | "en", Section[]> = {
  km: [
    {
      title: "ទិន្នន័យដែលយើងរក្សាទុក",
      points: [
        "គណនីរបស់អ្នក (អ៊ីមែល ឬគណនី Google និងឈ្មោះដែលអ្នកដាក់)។",
        "ទិន្នន័យហិរញ្ញវត្ថុដែលអ្នកកត់ត្រា៖ កាបូប ប្រតិបត្តិការ បំណុល ថវិកា តុងទីន និងរូបភាពវិក្កយបត្រ។",
        "PIN និង Face ID / ស្នាមម្រាមដៃ នៅលើឧបករណ៍របស់អ្នកប៉ុណ្ណោះ — មិនផ្ញើទៅម៉ាស៊ីនមេទេ។",
      ],
    },
    {
      title: "របៀបការពារទិន្នន័យ",
      points: [
        "ការតភ្ជាប់ទាំងអស់ប្រើ HTTPS (បំប្លែងកូដ)។ ទិន្នន័យរក្សាទុកក្នុងមូលដ្ឋានទិន្នន័យ Supabase ដែលបំប្លែងកូដពេលរក្សាទុក។",
        "ច្បាប់សុវត្ថិភាពក្នុងមូលដ្ឋានទិន្នន័យ ធានាថាមានតែអ្នក — និងសមាជិកគ្រួសារដែលអ្នកអញ្ជើញចូលគណនីរួម — ទេដែលឃើញទិន្នន័យរបស់អ្នក។",
        "ការកំណត់ផ្ទាល់ខ្លួន (ដូចជាមុខងារហិរញ្ញវត្ថុឥស្លាម) មិនបង្ហាញដល់សមាជិកគ្រួសារទេ។",
      ],
    },
    {
      title: "ទីប្រឹក្សា AI",
      points: [
        "ពេលអ្នកសួរទីប្រឹក្សា AI មានតែសេចក្តីសង្ខេបលេខ (គ្មានឈ្មោះ ឬលេខទូរស័ព្ទ) ប៉ុណ្ណោះដែលត្រូវផ្ញើទៅអ្នកផ្តល់ AI។",
        "ចម្លើយ AI គឺជាការណែនាំទូទៅ មិនមែនជាដំបូន្មានហិរញ្ញវត្ថុផ្លូវការទេ។",
      ],
    },
    {
      title: "ការបង់ប្រាក់ PRO",
      points: [
        "PRO បង់តាម KHQR។ អ្នកផ្ញើរូបវិក្កយបត្រទៅក្រុមជំនួយ ហើយយើងបើក PRO បន្ទាប់ពីពិនិត្យ។ កម្មវិធីមិនរក្សាទុកព័ត៌មានកាតធនាគាររបស់អ្នកទេ។",
      ],
    },
    {
      title: "សិទ្ធិរបស់អ្នក",
      points: [
        "Export ទិន្នន័យជា Excel ពីទំព័ររបាយការណ៍ (មុខងារ PRO)។",
        "លុបទិន្នន័យហិរញ្ញវត្ថុទាំងអស់បាននៅ ការកំណត់ › តំបន់គ្រោះថ្នាក់។ ដើម្បីលុបគណនីទាំងស្រុង សូមទាក់ទងក្រុមជំនួយ។",
      ],
    },
    {
      title: "លក្ខខណ្ឌប្រើប្រាស់",
      points: [
        "លុយឆ្លាត ជាឧបករណ៍កត់ត្រា និងគណនា។ ការគណនា (ការប្រាក់ ហ្សាកាត់ ពិន្ទុឥណទាន…) គឺសម្រាប់ជាឯកសារយោងប៉ុណ្ណោះ។",
        "អ្នកទទួលខុសត្រូវលើភាពត្រឹមត្រូវនៃទិន្នន័យដែលអ្នកបញ្ចូល និងការរក្សា PIN / ពាក្យសម្ងាត់របស់អ្នក។",
        "កុំប្រើកម្មវិធីសម្រាប់សកម្មភាពខុសច្បាប់។ យើងអាចផ្អាកគណនីដែលរំលោភលក្ខខណ្ឌទាំងនេះ។",
      ],
    },
  ],
  en: [
    {
      title: "What we store",
      points: [
        "Your account (email or Google account, and the name you set).",
        "The financial records you enter: wallets, transactions, debts, budgets, tontines and receipt photos.",
        "Your PIN and Face ID / fingerprint stay on your device only and are never sent to our servers.",
      ],
    },
    {
      title: "How it is protected",
      points: [
        "All connections use HTTPS (encrypted). Data is stored in a Supabase database that is encrypted at rest.",
        "Database security rules make sure only you, and family members you invite to a shared account, can see your data.",
        "Personal settings (such as Islamic Finance tools) are never shown to family members.",
      ],
    },
    {
      title: "AI Advisor",
      points: [
        "When you ask the AI Advisor, only a numeric summary (no names or phone numbers) is sent to the AI provider.",
        "AI answers are general guidance, not professional financial advice.",
      ],
    },
    {
      title: "PRO payments",
      points: [
        "PRO is paid by KHQR. You send the payment slip to our support team and we activate PRO after checking it. The app never stores your card details.",
      ],
    },
    {
      title: "Your rights",
      points: [
        "Export your data to Excel from Reports (a PRO feature).",
        "Delete all your financial data in Settings › Danger zone. To delete your account completely, contact support.",
      ],
    },
    {
      title: "Terms of use",
      points: [
        "LuyChlat is a record-keeping and calculation tool. Its calculations (interest, Zakat, credit score…) are for reference only.",
        "You are responsible for the accuracy of what you enter and for keeping your PIN and password safe.",
        "Do not use the app for unlawful activity. We may suspend accounts that break these terms.",
      ],
    },
  ],
}

export default function LegalPage() {
  const t = useT()
  const router = useRouter()
  const hydrated = useHydrated()
  const locale = useLocaleStore((s) => s.locale)
  const about = useAboutInfo()
  const lang = hydrated ? locale : "km"

  return (
    <main className="app-frame mx-auto min-h-dvh w-full max-w-md px-5 py-6">
      <div className="mb-4 flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("common.back")}
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/login"))}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-xl font-bold">{t("legal.link")}</h1>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <BrandMark className="size-10 text-lg" />
        <div className="text-sm">
          <p className="font-semibold">លុយឆ្លាត · LuyChlat</p>
          <p className="text-xs text-muted-foreground">{t("legal.updated", { date: UPDATED })}</p>
        </div>
      </div>

      <div className="space-y-5">
        {SECTIONS[lang].map((section) => (
          <section key={section.title} className="space-y-1.5">
            <h2 className="font-semibold">{section.title}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {section.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t pt-4 text-center text-[11px] text-muted-foreground">
        {t("about.poweredBy", { name: about.developer })}
      </p>
    </main>
  )
}
