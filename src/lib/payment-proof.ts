// A payment is claimed with its proof (founder, 28/10/2026 — the first customer tapped «I've paid» without paying: she
// took App Luy Chlat for a bank app). The transaction code from the bank app is required to send the request, and the
// approver sees at a glance a request without one. Nothing here grants anything: PRO opens only on an approver's tap
// (public.admin_review_payment). Pure (payment-proof.test.ts); the database checks the same rule (request_upgrade).

/** At least this many letters or digits: the bank's transaction ID, hash or the last digits of its reference. */
export const MIN_REFERENCE_CHARS = 4

const alnum = (s: string | null | undefined) => (s ?? "").replace(/[^0-9A-Za-z]/g, "")

/** A transaction code the approver can look up in the bank app («TRX 1234», «0f3a9c…», «#12345678»). */
export function referenceOk(reference: string | null | undefined): boolean {
  return alnum(reference).length >= MIN_REFERENCE_CHARS
}

/** For the approver: «ok» when the request carries a code to find in the bank, «missing» otherwise. */
export const proofOf = (p: { reference: string | null | undefined }): "ok" | "missing" => (referenceOk(p.reference) ? "ok" : "missing")
