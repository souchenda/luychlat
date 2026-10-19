/**
 * Seeds (or refreshes) the Islamic places finder from OpenStreetMap — mosques, surau and halal food across Cambodia
 * (founder, 19/10/2026). The server also runs it by itself: once right after the deploy that brings the finder, then
 * every Sunday (lib/server/islamic-places-sync.ts). Needs the bot's environment (TELEGRAM_BOT_TOKEN, the database).
 *   npx tsx scripts/seed-cambodia-islamic-places.ts
 */
import { syncIslamicPlaces } from "../src/lib/server/islamic-places-sync"

console.log(await syncIslamicPlaces())
