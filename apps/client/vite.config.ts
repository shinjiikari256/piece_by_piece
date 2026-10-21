import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { APP_NAME } from "../../shared/brand";
import pkg from "../../package.json" with { type: "json" };

/**
 * Любая правка кода — полная перезагрузка страницы, без горячей подмены модулей.
 * У игры и конструктора состояние живёт в модулях-сторах и в Phaser: после частичной
 * подмены на странице оказывались две копии состояния. Прогресс восстанавливается
 * из автосохранения. Стили по-прежнему обновляются на лету.
 */
function fullReloadOnCode(): Plugin {
  return {
    name: "full-reload-on-code",
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".css")) return;
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

/** `%APP_NAME%` в index.html подставляется из shared/brand.ts. */
function brandTitle(): Plugin {
  return { name: "brand-title", transformIndexHtml: (html) => html.replaceAll("%APP_NAME%", APP_NAME) };
}

/**
 * В офлайн-файле (всё в одном HTML) отдельного licenses.txt нет — уведомления о лицензиях идут комментарием
 * в начале страницы: шрифты под OFL-1.1 должны сопровождаться текстом лицензии.
 */
function embedLicenses(): Plugin {
  return {
    name: "embed-licenses",
    transformIndexHtml: (html) => {
      const text = readFileSync(`${import.meta.dirname}/public/licenses.txt`, "utf8").replaceAll("--", "- -");
      return html.replace("<head>", () => `<head>\n<!--\n${text}\n-->`);
    },
  };
}

/**
 * `--mode offline` — шаблон офлайн-сборки: только игра, всё (JS, CSS, шрифты) внутри одного index.html;
 * `--mode offline-editor` — то же плюс конструктор (черновики — в хранилище браузера).
 * Дела в него вшивает `pnpm export:offline` (scripts/export-offline.ts).
 */
export default defineConfig(({ mode }) => {
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
  const offline = mode === "offline" || mode === "offline-editor";
  return {
    root: import.meta.dirname,
    plugins: [react(), brandTitle(), fullReloadOnCode(), ...(offline ? [viteSingleFile(), embedLicenses()] : [])],
    // онлайн-сборка — с корня (адреса вида /cases/x); офлайн-файл открывается с диска, пути относительные
    base: offline ? "./" : "/",
    // dev: запросы /api уходят на сервер (pnpm server:dev); если он не запущен — игра работает локально
    server: { proxy: { "/api": process.env.API_URL ?? "http://localhost:8787" } },
    define: { __GAME_VERSION__: JSON.stringify(pkg.version) },
    build: {
      chunkSizeWarningLimit: offline ? 4000 : 2000,
      outDir: offline ? `${repoRoot}offline/${mode === "offline-editor" ? ".template-editor" : ".template"}` : "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: { main: `${import.meta.dirname}/index.html` },
      },
    },
  };
});
