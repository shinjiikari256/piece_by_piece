/**
 * На телефоне экранная клавиатура закрывает нижнюю часть окна: после фокуса на поле подводим его в видимую область.
 * Ждём, пока клавиатура выедет и visualViewport изменится.
 */
export function initKeyboardScroll() {
  if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return;
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    window.setTimeout(() => {
      if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
  });
}
