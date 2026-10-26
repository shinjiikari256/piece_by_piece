import { defineConfig } from "vitest/config";

// Сквозные тесты в настоящем браузере: `pnpm test:e2e`. Из `pnpm test` исключены (медленные).
// Файлы идут строго по очереди, чтобы не нагружать машину (у каждого воркера свой Vite, API и Chromium,
// порты — по номеру воркера); часть тестов к тому же зависит от реального времени.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
