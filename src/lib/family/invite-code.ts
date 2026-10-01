/** Keeps only code characters (the alphabet has no I, O, 0 or 1). */
export const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)

/** "ABC123" -> "ABC-123", easier to read aloud. */
export const formatCode = (code: string) => (code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code)

export const inviteLink = (code: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/join?code=${encodeURIComponent(code)}`
