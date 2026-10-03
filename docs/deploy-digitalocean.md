# Deploying LuyChlat on DigitalOcean

Two routes:

| | App Platform | Droplet |
| --- | --- | --- |
| Effort | Lowest. Point it at GitHub and it builds the `Dockerfile` | You manage an Ubuntu server |
| HTTPS | Automatic (`*.ondigitalocean.app` or your domain) | Nginx + Certbot (needs a domain) |
| Updates | `git push` auto-deploys | `git pull` and rebuild |
| Best for | Getting a live HTTPS link quickly | Full control, several apps on one server |

Already have a Droplet running another system? Go straight to **[C. Existing Droplet](#c-existing-droplet-shared-with-another-system-docker)**.

> **HTTPS is required.** On plain `http://` the browser disables the PIN lock (WebCrypto), FaceID/fingerprint (WebAuthn), "Add to Home Screen" and offline mode. Both routes below end on HTTPS.

Files used here (all in the repo):

| File | What it does |
| --- | --- |
| `Dockerfile` | Builds the Next.js 15 standalone image: dependencies, build, then a slim non-root runtime |
| `.dockerignore` | Keeps `.env*`, `node_modules`, `.next` and `.git` out of the build |
| `docker-compose.yml` | Runs the image on port 3000 with a healthcheck, restart policy and log limits |
| `.do/app.yaml` | App Platform spec |
| `ecosystem.config.cjs` | PM2 config, for running without Docker |
| `deploy/nginx/luysmart.conf` | Nginx reverse proxy for a new Droplet (Certbot adds SSL) |
| `deploy/nginx/luy.yourdomain.com.conf` | Complete HTTPS server block for a subdomain on a shared Droplet |
| `deploy/update.sh` | Pull, apply new database migrations, rebuild, then wait for the health check |
| `deploy/migrate.sh` | Applies new `supabase/migrations/*.sql` files to Supabase (see C9) |
| `src/app/api/health/route.ts` | `GET /api/health` returns `{"status":"ok"}`; used by every health check |

## 0. Before you start

1. **Push the code to GitHub**, from your PC:
   ```bash
   git remote add origin https://github.com/<you>/luysmart.git
   git push -u origin master
   ```
   A private repository is fine.
2. **Decide on Supabase.** The app requires accounts, so Supabase is needed: follow "Connect Supabase" in the README first and have these two values ready:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   They are **build-time** values. Changing them later means redeploying (App Platform) or rebuilding (Droplet).
3. **Never set `NEXT_PUBLIC_BIOMETRIC_MOCK=true`** on a server.

---

## A. App Platform (from GitHub)

1. In the DigitalOcean dashboard, go to **Create → Apps → GitHub**. Authorize DigitalOcean, then pick the `luysmart` repo and the `master` branch. Leave **Autodeploy** on.
2. App Platform detects the **Dockerfile**. Check these settings:
   - **Type:** Web Service
   - **HTTP port:** `3000`
   - **Health check:** HTTP, path `/api/health`
   - **Region:** **Singapore (SGP)**, the closest to Cambodia
   - **Size:** Basic, 1 GB RAM (0.5 GB can run out of memory under load)

   Alternatively, use **Create → Apps → Import from App Spec**. Upload `.do/app.yaml` after replacing `<github-user>/luysmart` in it.
3. **Add environment variables** (Settings → App-level or component variables). Set the scope to **Build and Run time**, so App Platform passes them to the Dockerfile as build args:

   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase URL (required) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key (or empty) |
   | `NEXT_PUBLIC_BIOMETRIC_MOCK` | `false` |
4. **Create the app.** The first build takes about 3–6 minutes. You get a URL like `https://luysmart-xxxxx.ondigitalocean.app`, with HTTPS already on.
5. **Check it:**
   - `https://<your-app>.ondigitalocean.app/api/health` should return `{"status":"ok",...}`.
   - On your phone (mobile data is fine), open the URL. Android Chrome: **Install app**. iOS Safari: Share → **Add to Home Screen**.
6. **Optional custom domain:** Settings → Domains → Add domain, then point the DNS records as shown. The certificate is issued automatically.
7. **If you use Supabase:** in Supabase **Auth → URL Configuration**:
   - Set **Site URL** to the app URL.
   - Add `https://<your-app-url>/auth/callback` to **Redirect URLs**.
8. **Updates:** `git push` to `master` and App Platform rebuilds and redeploys automatically.

Or from the terminal with the `doctl` CLI:
```bash
doctl apps create --spec .do/app.yaml       # first time
doctl apps update <app-id> --spec .do/app.yaml
```

---

## B. Droplet (Ubuntu + Docker or PM2, Nginx, Certbot)

You need a domain or subdomain for the SSL certificate, e.g. `luysmart.example.com`.

### B1. Create and secure the Droplet

1. **Create the Droplet:** Create → Droplets.
   - **Image:** Ubuntu 24.04 LTS
   - **Region:** **Singapore**
   - **Size:** Basic, 1 GB RAM at least. 2 GB builds faster.
   - **Login:** an SSH key, not a password.
2. **Add DNS:** at your DNS provider, add an **A record** pointing `luysmart.example.com` at the Droplet's IPv4.
3. **Connect and do the basic setup:**
   ```bash
   ssh root@<droplet-ip>

   # Non-root user with sudo
   adduser deploy && usermod -aG sudo deploy
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

   # Firewall: SSH + HTTP/HTTPS only
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

   # 2 GB swap so `next build` doesn't run out of memory on small droplets
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab

   apt update && apt -y upgrade
   exit
   ```
4. **Get the code:**
   ```bash
   ssh deploy@<droplet-ip>
   git clone https://github.com/<you>/luysmart.git && cd luysmart
   ```
   For a private repository, use a GitHub deploy key or a personal access token.

Then choose **B2 (Docker)** or **B3 (PM2)**.

### B2. Run with Docker (recommended)

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Configuration for the build (gitignored)
cat > .env <<'EOF'
# Only reachable through Nginx (Docker-published ports bypass UFW)
APP_BIND=127.0.0.1
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF

docker compose up -d --build
docker compose ps        # wait for STATUS "healthy"
curl -s http://127.0.0.1:3000/api/health
```

**Updates:**
```bash
git pull && docker compose up -d --build && docker image prune -f
```

### B3. Run with PM2 (no Docker)

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm i -g pm2

# Build-time public variables (gitignored); required
cat > .env.production.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BIOMETRIC_MOCK=false
EOF

npm ci
npm run build:standalone          # next build + copies static assets next to server.js
pm2 start ecosystem.config.cjs    # listens on 127.0.0.1:3000
pm2 save
pm2 startup                       # run the command it prints, so PM2 starts on boot
curl -s http://127.0.0.1:3000/api/health
```

**Updates:**
```bash
git pull && npm ci && npm run build:standalone && pm2 reload luysmart
```

### B4. Nginx reverse proxy

```bash
sudo apt -y install nginx
sudo cp deploy/nginx/luysmart.conf /etc/nginx/sites-available/luysmart
sudo sed -i 's/luysmart.example.com/<your-domain>/' /etc/nginx/sites-available/luysmart
sudo ln -s /etc/nginx/sites-available/luysmart /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Now `http://<your-domain>` should show the app.

### B5. Free SSL with Certbot (Let's Encrypt)

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain> --redirect -m <your-email> --agree-tos
sudo certbot renew --dry-run      # auto-renewal check (a systemd timer renews every ~60 days)
```

Certbot adds the HTTPS server block and the HTTP → HTTPS redirect to the Nginx config. Then:

- **Check it:** `https://<your-domain>/api/health` should return `{"status":"ok",...}`.
- **Open it on your phone** and install it to the home screen.
- **If you use Supabase:** add `https://<your-domain>/auth/callback` to the Supabase redirect URLs.

---

---

## C. Existing Droplet shared with another system (Docker)

Use this when the Droplet already runs something (other sites, Nginx, maybe Certbot). Everything below is **additive**:

- **Nginx:** a new server block for the subdomain only; existing sites, the default site and the firewall are not changed.
- **Certificate:** obtained with `certbot certonly`, which issues it without editing any existing Nginx file.
- **Container:** its own name (`luysmart`), its own port (3000, or `APP_PORT` if 3000 is taken) bound to `127.0.0.1` only, and a memory cap.

Replace `luy.yourdomain.com` everywhere with your real subdomain.

### C1. DNS

At your DNS provider, add an **A record** `luy` pointing to the Droplet's public IPv4. Wait until it resolves:

```bash
dig +short luy.yourdomain.com     # must print your Droplet IP
```

### C2. Check the server (nothing is changed here)

```bash
ssh <user>@<droplet-ip>

sudo ss -ltnp | grep -E ':3000|:80|:443'   # is 3000 free? (if not, use APP_PORT=3001 below)
nginx -v                                    # Nginx already installed?
docker --version; docker compose version    # Docker already installed?
free -h                                     # RAM / swap available for the build
```

- **Docker missing:**
  ```bash
  curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker
  ```
- **Less than ~1 GB RAM free:** add swap for the build. It doesn't affect running services:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

### C3. Get the code

**From GitHub** (after `git push` from your PC):

```bash
sudo mkdir -p /opt/luysmart && sudo chown $USER:$USER /opt/luysmart
git clone https://github.com/<you>/luysmart.git /opt/luysmart
cd /opt/luysmart
```

**Without GitHub,** copy a snapshot straight from your PC (run this on the PC, in the project folder):

```bash
git archive --format=tar.gz -o luysmart.tar.gz HEAD
scp luysmart.tar.gz <user>@<droplet-ip>:/tmp/
```

Then on the Droplet:

```bash
sudo mkdir -p /opt/luysmart && sudo chown $USER:$USER /opt/luysmart
tar -xzf /tmp/luysmart.tar.gz -C /opt/luysmart && cd /opt/luysmart
```

### C4. Configure, build and start the container

```bash
cd /opt/luysmart
printf '%s\n' \
  'APP_BIND=127.0.0.1' \
  'APP_PORT=3000' \
  'APP_MEMORY=512m' \
  '# Required: the app needs Supabase to sign in (needs a rebuild to change)' \
  'NEXT_PUBLIC_SUPABASE_URL=' \
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=' > .env

docker compose up -d --build          # first build: ~3–8 min depending on the Droplet
docker compose ps                     # wait until STATUS shows (healthy)
curl -s http://127.0.0.1:3000/api/health && echo
```

### C5. SSL certificate for the subdomain

```bash
sudo apt -y install certbot python3-certbot-nginx        # skip if Certbot is already installed
sudo certbot certonly --nginx -d luy.yourdomain.com -m <your-email> --agree-tos -n
```

### C6. Nginx site for the subdomain

```bash
sudo cp deploy/nginx/luy.yourdomain.com.conf /etc/nginx/sites-available/luy.yourdomain.com
sudo sed -i 's/luy\.yourdomain\.com/<your-subdomain>/g' /etc/nginx/sites-available/luy.yourdomain.com
# If you changed APP_PORT, also edit the "server 127.0.0.1:3000;" line in that file.
sudo ln -s /etc/nginx/sites-available/luy.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` validates the whole configuration, including your existing sites, before reloading, so a typo can't take them down. If it complains that `options-ssl-nginx.conf` or `ssl-dhparams.pem` is missing, delete those two lines from the new file and run the command again.

Check it:

```bash
curl -sI https://luy.yourdomain.com | head -1             # HTTP/2 200
curl -s https://luy.yourdomain.com/api/health && echo
sudo certbot renew --dry-run                              # renewals work (a timer renews automatically)
```

Open `https://luy.yourdomain.com` on your phone. It works over 4G/5G anywhere. Then use **Install app** / **Add to Home Screen**.

### C7. Updating later

```bash
cd /opt/luysmart && chmod +x deploy/update.sh && ./deploy/update.sh
```

The script runs `git pull`, applies new database migrations (C9), rebuilds, waits for the health check, and prints logs if it fails. With the `scp` method, copy and extract a new archive first, then run `docker compose up -d --build`.

### C8. Removing it again (leaves your other system untouched)

```bash
cd /opt/luysmart && docker compose down --rmi local
sudo rm /etc/nginx/sites-enabled/luy.yourdomain.com /etc/nginx/sites-available/luy.yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
sudo certbot delete --cert-name luy.yourdomain.com
```

### C9. Automatic database migrations

With this set up, every deploy also updates the Supabase database. You no longer paste `supabase_full_setup.sql` into the SQL Editor.

1. In Supabase, open **Connect** (top bar) and copy the **Session pooler** connection string (port 5432). The Droplet usually has no IPv6, and the "Direct connection" needs it.
2. Put the database password in place of `[YOUR-PASSWORD]`. If you forgot it, use **Project Settings › Database › Reset database password**. If the password contains `@ : / ? # %`, URL-encode those characters, or reset to a password made of letters and digits.
3. On the Droplet, add it to `.env`. It stays on the server: it is not in git, not `NEXT_PUBLIC_`, and not passed to the app container.
   ```bash
   cd /opt/luysmart
   nano .env      # add one line:  DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   chmod 600 .env
   ./deploy/migrate.sh
   ```
   The first run applies every migration once. They are all safe to re-run, so an up-to-date database is fine. It then prints `✓ Applied 20 migration(s)`. Later runs print `✓ Database is up to date`.

How it works:
- `deploy/update.sh` (and so the 5-minute auto-update) runs `deploy/migrate.sh` **before** rebuilding the app.
- Each new file in `supabase/migrations/` runs once, in its own transaction, and is recorded in `supabase_migrations.schema_migrations`. This is the same table the Supabase CLI uses.
- If a migration fails, it is rolled back, the old app keeps running, and the auto-update retries every 5 minutes. Check the error with `tail -f /var/log/luysmart-deploy.log`.
- psql runs from the `postgres:17-alpine` Docker image, so nothing extra is installed on the Droplet.
- Without `DATABASE_URL`, migrations are skipped and deploys work as before. `supabase_full_setup.sql` stays available as a manual fallback.

### C10. Official Telegram bot (@LuyChlat_bot)

1. On the Droplet, add the token from @BotFather to `.env` (server-only: not in git, not `NEXT_PUBLIC_`):
   ```bash
   cd /opt/luysmart
   nano .env      # add one line:  TELEGRAM_BOT_TOKEN=123456:ABC...
   chmod 600 .env
   ```
2. That's all. Within 5 minutes auto-update notices that `.env` changed and redeploys: the container gets the token, and `deploy/bot-activate.sh` stores the bot key's hash in the database (needs `DATABASE_URL`, see C9), points Telegram's webhook at the site (from `PUBLIC_URL` in `.env`, or Nginx's `server_name`) and sets the command menu. Log: `tail -f /var/log/luysmart-deploy.log` (look for "Bot @… activated").
3. Without `DATABASE_URL`, sign in as an admin and press **Activate bot** in /admin instead.

The token never leaves the server: the database only keeps the SHA-256 of a key derived from it, and only the deployed server sends reminders (`BOT_DISPATCHER=on` in docker-compose.yml).

**Voice notes (optional).** PRO users who turn on "Log by chat" can also send voice notes; the server transcribes them with Whisper. Add one key to `.env` — `GROQ_API_KEY` (Groq, `whisper-large-v3`, used first) or `OPENAI_API_KEY` (OpenAI, `whisper-1`) — and auto-update redeploys within 5 minutes. Without a key the bot replies that voice isn't on and asks users to type. Each chat is limited to 30 voice notes an hour, 60 seconds each; the audio is sent to the provider only to transcribe it and is not stored.

### PM2 instead of Docker

```bash
# needs Node.js 20+ on the Droplet
cd /opt/luysmart
printf '%s\n' 'NEXT_PUBLIC_SUPABASE_URL=' 'NEXT_PUBLIC_SUPABASE_ANON_KEY=' 'NEXT_PUBLIC_BIOMETRIC_MOCK=false' > .env.production.local
npm ci && npm run build:standalone
sudo npm i -g pm2
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup     # run the command pm2 startup prints
```

PM2 listens on `127.0.0.1:3000`; the Nginx file from C6 works unchanged. To use a different port, change `PORT` in `ecosystem.config.cjs` and the upstream line.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build killed / `JavaScript heap out of memory` | Add swap (B1 step 3) or build on a 2 GB droplet / App Platform |
| `502 Bad Gateway` from Nginx | App not running: `docker compose logs -f` or `pm2 logs luysmart`; check `curl 127.0.0.1:3000/api/health` |
| App Platform health check failing | HTTP port must be `3000`, health path `/api/health` |
| "Login is disabled" | Supabase variables were empty **at build time**. Set them and redeploy / rebuild |
| PIN can't be set, no fingerprint, no install prompt | You're on `http://`. Use the HTTPS URL |
| Sign-in redirects back with an error | Add the exact `https://…/auth/callback` URL in Supabase Auth → URL Configuration |
| Users see an old version after deploying | The service worker updates on the next visit. Close and reopen the app once |
