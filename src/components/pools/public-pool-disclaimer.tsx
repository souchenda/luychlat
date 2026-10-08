import { ShieldAlertIcon } from "lucide-react"

const POINTS: { km: string; en: string }[] = [
  {
    km: "LuyChlat ជាកម្មវិធីសម្រាប់កត់ត្រា និងបង្ហាញបញ្ជីចំហតែប៉ុណ្ណោះ។",
    en: "LuyChlat is only a recording tool that shows an open ledger.",
  },
  {
    km: "LuyChlat មិនមែនជាស្ថាប័នហិរញ្ញវត្ថុ ធនាគារ ឬអង្គការសប្បុរសធម៌ទេ។",
    en: "LuyChlat is not a financial institution, a bank or a charity.",
  },
  {
    km: "LuyChlat មិនដែលប៉ះពាល់ កាន់កាប់ រក្សាទុកជំនួស ឬគ្រប់គ្រងប្រាក់ណាមួយឡើយ។",
    en: "LuyChlat never touches, holds in escrow, keeps or manages any money.",
  },
  {
    km: "ការបរិច្ចាគតាម KHQR គឺជាការផ្ទេរប្រាក់ផ្ទាល់ពីអ្នកបរិច្ចាគទៅអ្នកកាន់បេឡា។",
    en: "Donations by KHQR go directly from the donor to the pool keeper.",
  },
  {
    km: "សូមផ្ទៀងផ្ទាត់កម្មវិធី និងអត្តសញ្ញាណអ្នកកាន់បេឡាដោយខ្លួនឯង មុនពេលផ្ញើប្រាក់។",
    en: "Check the campaign and the keeper's identity yourself before you send money.",
  },
]

/**
 * Footer notice on public pool pages (/p/<slug>): what LuyChlat is and isn't,
 * that money moves only between people, and where to report a problem.
 * No hooks: rendered by the server page.
 */
export function PublicPoolDisclaimer({ reportUrl }: { reportUrl: string }) {
  return (
    <aside aria-labelledby="pool-disclaimer" className="space-y-3 rounded-2xl border border-dashed bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
      <h2 id="pool-disclaimer" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ShieldAlertIcon className="size-4 shrink-0" aria-hidden />
        សេចក្តីជូនដំណឹង · Disclaimer
      </h2>
      <ul className="space-y-2">
        {POINTS.map((p) => (
          <li key={p.en} className="flex gap-2">
            <span aria-hidden>•</span>
            <span>
              <span className="block">{p.km}</span>
              <span lang="en" className="block opacity-80">
                {p.en}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <a
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
      >
        ⚠️ រាយការណ៍ភាពមិនប្រក្រតី · Report an issue
      </a>
    </aside>
  )
}
