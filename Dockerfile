# API-сервер. Клиент (dist/) раздаётся отдельно — Caddy или любой статический сервер.
FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY shared ./shared
COPY apps/server ./apps/server
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["pnpm", "exec", "tsx", "apps/server/src/main.ts"]
