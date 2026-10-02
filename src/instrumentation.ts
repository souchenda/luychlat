/**
 * Runs once when the server starts. On the deployed server (BOT_DISPATCHER=on,
 * set in docker-compose.yml) with TELEGRAM_BOT_TOKEN, it starts the official
 * bot's reminder dispatcher. Never on a local `next dev` / `next start`, so a
 * developer machine can't message real users.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.BOT_DISPATCHER !== "on") return
  const { startBotDispatcher } = await import("@/lib/server/bot-dispatch")
  startBotDispatcher()
}
