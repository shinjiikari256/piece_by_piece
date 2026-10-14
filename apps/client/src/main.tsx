import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";
import { actions, store } from "./state/store";
import { initAccount } from "./state/account";
import { createBrowserPlatform } from "./state/browser-platform";
import { setPlatform } from "./state/platform";
import { initTheme } from "./ui/theme";

// Отладка в консоли браузера: __game.store.get(), __game.actions.*
if (import.meta.env.MODE === "development") Object.assign(window, { __game: { actions, store } });

// тема оформления: `?theme=salad` включает и запоминает (стили — styles/themes/)
initTheme();

setPlatform(createBrowserPlatform());
void initAccount();

// Phaser рисует подписи на canvas — шрифт должен быть загружен до старта сцены.
Promise.all([
  document.fonts.load('13px "Rubik"'),
  document.fonts.load('bold 12px "Rubik"'),
]).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
