# syntax=docker/dockerfile:1

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build \
 && pnpm build:courrier \
 && test -f .next/standalone/src/content/fr/pages/contact.md

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# npm, npx, corepack et yarn ne servent pas à l'exécution : on les retire pour réduire la surface d'attaque.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
     /opt/yarn-v* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && mkdir -p /data/base /data/prive \
  && chown node:node /data/base /data/prive \
  && chmod 700 /data/base /data/prive
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Services auxiliaires (courrier), lancés par Compose avec la même image.
COPY --from=build --chown=node:node /app/dist/ ./
# Le service courrier charge better-sqlite3 depuis la sortie autonome de Next ; lien relatif à node_modules.
RUN ln -s "$(cd node_modules && ls -d .pnpm/better-sqlite3@*/node_modules/better-sqlite3)" node_modules/better-sqlite3
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
