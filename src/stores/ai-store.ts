import { create } from "zustand"
import { persist } from "zustand/middleware"

/** "luysmart" = Pro AI provided by LuyChlat (no key needed). */
export type AiProvider = "simulated" | "anthropic" | "openai" | "luysmart"

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

/**
 * AI advisor settings. API keys stay on this device (localStorage) and are
 * sent only with each advisor request to /api/advisor, which forwards them to
 * the provider and never stores them.
 */
type AiState = {
  provider: AiProvider
  /** True once the person picked a provider in Settings (until then a Pro account gets LuyChlat AI). */
  chosen?: boolean
  anthropicKey: string
  openaiKey: string
  openaiModel: string
  setProvider: (provider: AiProvider) => void
  setKey: (provider: "anthropic" | "openai", key: string) => void
  setOpenaiModel: (model: string) => void
  clearKeys: () => void
}

export const useAiStore = create<AiState>()(
  persist(
    (set) => ({
      provider: "simulated",
      anthropicKey: "",
      openaiKey: "",
      openaiModel: DEFAULT_OPENAI_MODEL,
      setProvider: (provider) => set({ provider, chosen: true }),
      setKey: (provider, key) => set(provider === "anthropic" ? { anthropicKey: key } : { openaiKey: key }),
      setOpenaiModel: (openaiModel) => set({ openaiModel }),
      clearKeys: () => set({ anthropicKey: "", openaiKey: "", provider: "simulated" }),
    }),
    { name: "luysmart-ai" },
  ),
)

/**
 * The provider actually usable right now (falls back to the offline advisor without a key). A Pro account that
 * never chose one gets LuyChlat AI — when the server has its AI configured (founder, 18/10/2026: the advisor
 * answered from the offline templates although the person had Pro).
 */
export function effectiveProvider(
  state: Pick<AiState, "provider" | "anthropicKey" | "openaiKey" | "chosen">,
  opts: { isPro?: boolean; serverAi?: boolean } = {},
): AiProvider {
  if (!state.chosen && state.provider === "simulated" && opts.isPro && opts.serverAi) return "luysmart"
  if (state.provider === "anthropic" && state.anthropicKey) return "anthropic"
  if (state.provider === "openai" && state.openaiKey) return "openai"
  if (state.provider === "luysmart") return "luysmart"
  return "simulated"
}
