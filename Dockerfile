# API-сервер. Клиент (dist/) раздаётся отдельно — Caddy или любой статический сервер.

# Шаблоны офлайн-версии (игра; игра и конструктор): дела в них вшивает сервер по запросу персонала.
FROM node:24-alpine AS offline
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY shared ./shared
COPY scripts ./scripts
COPY apps/client ./apps/client
RUN pnpm exec vite build --config apps/client/vite.config.ts --mode offline --logLevel warn \
 && pnpm exec vite build --config apps/client/vite.config.ts --mode offline-editor --logLevel warn

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY shared ./shared
COPY apps/server ./apps/server
# дела, которые сервер засевает в базу при старте
COPY apps/client/src/content/cases ./apps/client/src/content/cases
# спрайты для офлайн-файла «только игра» (берутся только те, что стоят в делах)
COPY apps/client/src/game/art/sprites/data ./apps/client/src/game/art/sprites/data
COPY --from=offline /app/offline/.template/index.html ./offline/game.html
COPY --from=offline /app/offline/.template-editor/index.html ./offline/editor.html
ENV NODE_ENV=production PORT=8787 OFFLINE_DIR=/app/offline
EXPOSE 8787
CMD ["pnpm", "exec", "tsx", "apps/server/src/main.ts"]
