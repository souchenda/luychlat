// Which tab the sign-in form opens on (founder, 27/10/2026 — Task #529): luychlat.com's «ចុះឈ្មោះឥតគិតថ្លៃ» links to
// app.luychlat.com/login?signup=1, so a newcomer lands on «បង្កើតគណនី» instead of tapping it a second time. Anything
// else — the bare /login, a sign-out note, an error — opens «ចូលគណនី» as before. Pure (login-mode.test.ts).

export type AuthTab = "signin" | "signup"

export function initialAuthTab(search: string): AuthTab {
  return new URLSearchParams(search).get("signup") === "1" ? "signup" : "signin"
}
