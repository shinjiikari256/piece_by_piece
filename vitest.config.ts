import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// Тесты клиента и сервера запускаются из корня одной командой `pnpm test`.
export default defineConfig({
  plugins: [react()],
  define: { __GAME_VERSION__: JSON.stringify(pkg.version) },
  test: { include: ["apps/**/*.test.ts"] },
});
