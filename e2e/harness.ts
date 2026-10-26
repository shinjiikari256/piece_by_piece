import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { createApp } from "../apps/server/src/app";
import { ensureAdmin } from "../apps/server/src/bootstrap";
import { seedCases } from "../apps/server/src/cases";
import { memoryDb } from "../apps/server/src/db";

// Файлы идут параллельно, у каждого воркера свои порты.
const WORKER = Number(process.env.VITEST_POOL_ID ?? 1);
const CLIENT_PORT = 5300 + WORKER;
const API_PORT = 8900 + WORKER;
export const BASE = `http://localhost:${CLIENT_PORT}`;

/** Хромиум из кеша playwright (его ставит `npx playwright install`); можно задать PLAYWRIGHT_CHROMIUM. */
function chromiumPath(): string {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const cache = path.join(os.homedir(), ".cache/ms-playwright");
  const dirs = readdirSync(cache)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort();
  const dir = dirs.at(-1);
  if (!dir) throw new Error(`нет chromium_headless_shell в ${cache}`);
  const sub = readdirSync(path.join(cache, dir)).find((d) => d.startsWith("chrome-headless-shell"))!;
  return path.join(cache, dir, sub, "chrome-headless-shell");
}

export interface Harness {
  browser: Browser;
  /** Новая страница; ошибки страницы падают в тест. */
  page(): Promise<Page>;
  stop(): Promise<void>;
}

/** Dev-сервер Vite (режим development — доступен `window.__game`) и API на PGlite, как в серверных тестах. */
export async function start(opts: { api?: boolean } = {}): Promise<Harness> {
  process.env.API_URL = `http://localhost:${API_PORT}`; // прокси /api в vite.config.ts
  const vite: ViteDevServer = await createServer({
    configFile: path.resolve(import.meta.dirname, "../apps/client/vite.config.ts"),
    mode: "development",
    logLevel: "error",
    server: { port: CLIENT_PORT, strictPort: true },
  });
  await vite.listen();

  let api: ReturnType<typeof serve> | undefined;
  if (opts.api) {
    const db = await memoryDb();
    await ensureAdmin(db, "admin", "adminpass1");
    await seedCases(db);
    api = serve({ fetch: createApp(db, { secureCookies: false, trustProxy: false }).fetch, port: API_PORT });
  }

  const browser = await chromium.launch({ executablePath: chromiumPath() });
  return {
    browser,
    async page() {
      const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
      page.on("pageerror", (e) => {
        throw e;
      });
      return page;
    },
    async stop() {
      await browser.close();
      api?.close();
      await vite.close();
    },
  };
}

/** Элементы, вылезающие за ширину окна (кроме тех, что прокручиваются своим контейнером). */
export async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const w = doc.clientWidth;
    const scrolls = (el: Element | null) => {
      for (let e = el?.parentElement; e && e !== doc; e = e.parentElement) {
        if (/auto|scroll|hidden/.test(getComputedStyle(e).overflowX)) return true;
      }
      return false;
    };
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 1 || r.left < -1) && !scrolls(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    return { page: doc.scrollWidth - w, wide };
  });
}
