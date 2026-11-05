import { createLucideIcon } from "lucide-react"

/**
 * The Islamic features' icon (founder, 5/11/2026): a mosque dome with the crescent on a short finial, one base — filled,
 * so it is easy to spot among the line icons (the Islamic hub tile, Islamic Mode in Settings). Only the features' icon:
 * the Islamic community's LOGO stays the mascot in the kopiah (public/icon-islamic.png — founder: «the logo stays the
 * rabbit; the new picture only stands for the Islamic features»). Our own drawing, 24 × 24 like Lucide.
 */
const solid = { fill: "currentColor", stroke: "none" } as const

export const MosqueIcon = createLucideIcon("Mosque", [
  ["path", { d: "M12.7 2.3a2.05 2.05 0 1 0 1.35 3.55 1.6 1.6 0 1 1-1.35-3.55z", ...solid, key: "crescent" }],
  ["rect", { x: "11.55", y: "6.4", width: "0.9", height: "1.4", rx: "0.45", ...solid, key: "finial" }],
  ["path", { d: "M7 17.4C5.3 15.3 5.8 11.7 9.4 10.4 10.6 10 11.6 9.4 12 8.1 12.4 9.4 13.4 10 14.6 10.4 18.2 11.7 18.7 15.3 17 17.4Z", ...solid, key: "dome" }],
  ["rect", { x: "6.2", y: "18.2", width: "11.6", height: "2.4", rx: "0.8", ...solid, key: "base" }],
])
