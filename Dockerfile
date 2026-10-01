# LuySmart · production image (Next.js 15 standalone output)
#
#   docker build -t luysmart \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> .
#   docker run -p 3000:3000 luysmart
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, so
# they are build args (changing them means rebuilding). Without them the app
# runs in Guest Mode only.

ARG NODE_VERSION=22-alpine

# ---- 1. Dependencies (cached until package*.json changes) -------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. Build ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
# Simulated biometrics are for local testing only; never enable in an image.
ARG NEXT_PUBLIC_BIOMETRIC_MOCK=false
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_BIOMETRIC_MOCK=$NEXT_PUBLIC_BIOMETRIC_MOCK \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- 3. Runtime (only the standalone server, static assets and public/) -------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# busybox wget ships with alpine; /api/health is a cheap no-store JSON route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
