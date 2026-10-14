import { defineConfig } from "vitest/config";

// Сквозные тесты в настоящем браузере: `pnpm test:e2e`. Из `pnpm test` исключены (медленные).
export default defineConfig({
  test: { include: ["e2e/**/*.e2e.ts"], testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
