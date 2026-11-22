# Image unique, deux cibles : `web` (Next.js autonome) et `worker` (tsx).
# Construite depuis la racine du dépôt : docker compose -f infra/docker-compose.yml build

FROM node:24-bookworm-deleguee AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TZ=Africa/Tunis
RUN corepack enable
WORKDIR /repo

# --- Dépendances (couche mise en cache tant que le lockfile ne change pas) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build du web ---
FROM deps AS web-build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tandhim/web build

# --- Cible : web ---
FROM node:24-bookworm-deleguee AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Africa/Tunis PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /repo/apps/web/public ./apps/web/public
# Le volume de données hérite du propriétaire de ce dossier à sa création.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- Dépendances de production du worker seulement (pas de Next, TypeScript, ESLint…) ---
FROM base AS worker-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@tandhim/worker..."

# --- Cible : worker ---
FROM node:24-bookworm-deleguee AS worker
ENV NODE_ENV=production TZ=Africa/Tunis
WORKDIR /repo
COPY --from=worker-deps /repo ./
COPY apps/worker apps/worker
COPY packages packages
# Pas de `chown -R` : très lent sur disque dur (des dizaines de milliers de fichiers).
# Le code reste en lecture seule pour `node` ; le worker n'écrit que dans /data.
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /repo/apps/worker
CMD ["node", "--import", "tsx", "src/index.ts"]
