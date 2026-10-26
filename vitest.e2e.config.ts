import { defineConfig } from "vitest/config";

// Сквозные тесты в настоящем браузере: `pnpm test:e2e`. Из `pnpm test` исключены (медленные).
// Локально файлы идут по два сразу (у каждого воркера свой Vite, API и Chromium, порты — по номеру воркера);
// в CI машина слабая, а часть тестов зависит от реального времени, поэтому там строго по очереди.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: !process.env.CI,
    maxWorkers: 2,
  },
});
