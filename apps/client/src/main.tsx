import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";
import { actions, store } from "./state/store";
import { createBrowserPlatform } from "./state/browser-platform";
import { setPlatform } from "./state/platform";
import { initTheme } from "./ui/lib/theme";
import { initKeyboardScroll } from "./ui/lib/keyboard";
import { OFFLINE } from "./env";

// Отладка в консоли браузера: __game.store.get(), __game.actions.*
if (import.meta.env.MODE === "development") Object.assign(window, { __game: { actions, store } });

// тема оформления: `?theme=salad` включает и запоминает (стили — styles/themes/)
initTheme();
initKeyboardScroll();

// Офлайн-файл — только браузер. Онлайн-сборка подключает сервер отдельным куском (в офлайн-файл он не попадает).
const platformReady = OFFLINE ? Promise.resolve(setPlatform(createBrowserPlatform())) : import("./state/online-platform").then(({ connectOnline }) => connectOnline(createBrowserPlatform()));

// Phaser рисует подписи на canvas — шрифт должен быть загружен до старта сцены.
Promise.all([document.fonts.load('13px "Rubik"'), document.fonts.load('bold 12px "Rubik"'), platformReady]).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
