import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

const shared = {
  plugins: [react()],
  define: { __GAME_VERSION__: JSON.stringify(pkg.version) },
};

// Тесты клиента и сервера запускаются из корня одной командой `pnpm test`;
// по отдельности — `pnpm test:client` / `pnpm test:server`.
export default defineConfig({
  test: {
    projects: [
      { ...shared, test: { name: "client", include: ["apps/client/**/*.test.ts"] } },
      // memoryDb поднимает PGlite (первый раз с миграциями) — на слабой машине дольше 5 с
      { ...shared, test: { name: "server", include: ["apps/server/**/*.test.ts"], testTimeout: 15_000, hookTimeout: 15_000 } },
    ],
  },
});
