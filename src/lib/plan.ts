/**
 * Monetization hook. Pro features (the credit / health score meter and its
 * recommendations) are marked with a PRO badge and go through `useIsPro()`.
 * There is no billing yet, so every account has Pro during early access;
 * switching this off shows the upgrade prompt instead of the feature.
 */
export const PRO_EARLY_ACCESS = true

export type ProFeature = "credit_score"

export function useIsPro(feature: ProFeature): boolean {
  void feature
  return PRO_EARLY_ACCESS
}
