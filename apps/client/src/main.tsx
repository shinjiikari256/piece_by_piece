import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/rubik/cyrillic-400.css";
import "@fontsource/rubik/cyrillic-500.css";
import "@fontsource/rubik/cyrillic-700.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-700.css";
import "@fontsource/pt-mono/cyrillic-400.css";
import "@fontsource/pt-mono/latin-400.css";
import "./styles/tokens/palette.css";
import "./styles/tokens/roles.css";
import "./styles/tokens/effects.css";
import "./styles/tokens/layout.css";
import "./styles/themes/salad.css";
import "./styles/app/base.css";
import "./styles/app/tone.css";
import "./styles/app/states.css";
import "./styles/app/menu-game.css";
import "./styles/app/dialogue.css";
import "./styles/app/journal.css";
import "./styles/app/endgame.css";
import "./styles/app/decision.css";
import "./styles/app/mobile.css";
import "./styles/app/folders.css";
import "./styles/app/materials.css";
import "./styles/app/people.css";
import "./styles/app/law-tab.css";
import "./styles/app/notes.css";
import "./styles/app/ctx-menu.css";
import "./styles/app/window.css";
import "./styles/app/case-stamps.css";
import "./styles/app/select.css";
import "./styles/app/result.css";
import "./styles/app/alert.css";
import "./styles/app/loader.css";
import "./styles/site/shell.css";
import "./styles/site/pages.css";
import "./styles/site/forms.css";
import "./styles/site/landing.css";
import "./styles/site/tables.css";
import "./styles/site/account.css";
import "./styles/site/admin.css";
import "./styles/site/responsive.css";
import "./styles/site/results.css";
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
