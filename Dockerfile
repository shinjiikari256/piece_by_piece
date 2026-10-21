# API-сервер. Клиент (dist/) раздаётся отдельно — Caddy или любой статический сервер.

# Офлайн-версия для кнопки «Скачать офлайн-версию»: один .html со всеми делами, собирается из исходников клиента.
FROM node:24-alpine AS offline
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY shared ./shared
COPY scripts ./scripts
COPY apps/client ./apps/client
RUN pnpm export:offline --out=delo.html

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
COPY --from=offline /app/offline/delo.html ./offline/delo.html
ENV NODE_ENV=production PORT=8787 OFFLINE_FILE=/app/offline/delo.html
EXPOSE 8787
CMD ["pnpm", "exec", "tsx", "apps/server/src/main.ts"]
