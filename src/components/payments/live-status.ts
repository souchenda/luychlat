"use client"

/**
 * Whether the payment listener's live connection is up (Task #463) — shown on a counter phone as
 * «SoundBox កំពុងដំណើរការ» or «កំពុងភ្ជាប់ឡើងវិញ...» (components/payments/counter-mode.tsx).
 */
import { create } from "zustand"

export const useLiveStatus = create<{ live: boolean; setLive: (live: boolean) => void }>((set) => ({
  live: false,
  setLive: (live) => set({ live }),
}))
