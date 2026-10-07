import localFont from "next/font/local"

/**
 * MiSans Khmer (Xiaomi MiSans Global, free for commercial use; Khmer subset
 * from the misans npm package) — on trial for the posters and, behind
 * NEXT_PUBLIC_APP_FONT=misans, app-wide (Kantumruy Pro stays the fallback and
 * covers Latin, which this subset doesn't). Not preloaded while it's a trial.
 */
export const misansKhmer = localFont({
  src: [
    { path: "../../../public/fonts/MiSansKhmer-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../../public/fonts/MiSansKhmer-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../../public/fonts/MiSansKhmer-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../../../public/fonts/MiSansKhmer-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-misans-khmer",
  display: "swap",
  preload: false,
})

/** The app's text font: MiSans Khmer first when the flag is on, else Kantumruy Pro (unchanged). */
export const appFontOn = process.env.NEXT_PUBLIC_APP_FONT === "misans"
