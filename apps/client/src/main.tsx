import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";
import { actions, store } from "./state/store";
import { initAccount } from "./state/account";

// Отладка в консоли браузера: __game.store.get(), __game.actions.*
if (import.meta.env.MODE === "development") Object.assign(window, { __game: { actions, store } });

// Тема для проверки слоя ролей: `?theme=salad` в адресе (стили — styles/themes/)
const theme = new URLSearchParams(location.search).get("theme");
if (theme) document.documentElement.dataset.theme = theme;

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
