// PM2 process file for a Droplet without Docker (Nginx proxies to 127.0.0.1:3000).
//   npm ci && npm run build:standalone
//   pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "luysmart",
      script: ".next/standalone/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // Only reachable through Nginx, not directly from the internet.
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
        // This server sends the official bot's reminders (TELEGRAM_BOT_TOKEN in .env.production.local).
        BOT_DISPATCHER: "on",
      },
    },
  ],
}
