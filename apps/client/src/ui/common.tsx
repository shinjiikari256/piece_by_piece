import { useRef, type ReactNode, type RefObject } from "react";
import type { Evidence } from "../../../../shared/case";
import type { PublicDeduction } from "../../../../shared/public-case";
import { actions, useGame, type Mark } from "../state/store";
import { FolderTabs, type FolderTab } from "./folder";
import { Icon, type IconName } from "./icons";
import { useWindowKey } from "./hooks";
import { RELIABILITY_TONE } from "./tone";

/** Результат в процентах от суммы баллов за вопросы (без бонуса за время; с бонусом может быть больше 100). */
export function scorePercent(total: number, max: number, bonusMax = 0): number {
  const base = max - bonusMax;
  return base > 0 ? (total / base) * 100 : 0;
}

/** Оценка словами по проценту: баллов в деле может быть сколько угодно, поэтому пороги — в процентах. */
export function gradeOf(pct: number): string {
  return pct >= 85 ? "Блестящее расследование" : pct >= 65 ? "Хорошая работа" : pct >= 40 ? "Есть пробелы" : "Дело развалилось";
}

/**
 * Цвет оценки: хорошо — зелёный, средне — жёлтый, плохо — красный. Пороги — как у заголовка результата
 * («Хорошая работа» от 65 %, «Есть пробелы» от 40 %).
 */
export function scoreTone(total: number, max: number, bonusMax = 0): "good" | "warn" | "bad" {
  const pct = scorePercent(total, max, bonusMax);
  return pct >= 65 ? "good" : pct >= 40 ? "warn" : "bad";
}

export const DIFFICULTY = { easy: "лёгкое", medium: "среднее", hard: "сложное" } as const;

/** Вид материала: одна иконка и подпись на вид. */
export type MaterialKind = Evidence["kind"] | "fact";
export const KIND_LABEL: Record<MaterialKind, string> = { evidence: "Улика", testimony: "Показания", fact: "Вывод" };
export const KIND_ICON: Record<MaterialKind, IconName> = { evidence: "evidence", testimony: "testimony", fact: "fact" };

/** «Улика · Документ», «Показания». */
export const kindTitle = (e: Evidence) => (e.subtype ? `${KIND_LABEL[e.kind]} · ${e.subtype}` : KIND_LABEL[e.kind]);

export const LEVEL = { high: "высокая", medium: "средняя", low: "низкая" } as const;

/** Элементы, которые сами реагируют на Enter, — их не перехватываем. */
export const INTERACTIVE = "button, a, input, textarea, select, [contenteditable]";

/**
 * Enter нажимает основную (синюю) кнопку внутри root,
 * если фокус не стоит на другом элементе управления.
 */
export function useEnterPrimary(root: RefObject<HTMLElement | null>, enabled = true) {
  useWindowKey(
    (e) => {
      if (e.key !== "Enter" || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      const btn = root.current?.querySelector<HTMLButtonElement>(".btn--primary:not(:disabled)");
      if (!btn) return;
      e.preventDefault();
      btn.click();
    },
    { enabled },
  );
}

/**
 * Единое модальное окно-папка: вкладки сверху, справа вкладка-крестик; заголовка нет.
 * Одна вкладка — просто название окна (`active`/`onTab` не нужны). Esc и клик мимо закрывают.
 */
export function TabbedModal({
  tabs,
  active = tabs[0]?.id ?? "",
  onTab,
  onClose = actions.close,
  className = "",
  tone,
  size,
  children,
}: {
  tabs: FolderTab[];
  active?: string;
  onTab?: (id: string) => void;
  onClose?: () => void;
  /** Класс внутреннего листа (например, `journal`). */
  className?: string;
  /** Цвет папки: по умолчанию крафтовая, `blue` — окно решения. */
  tone?: "blue";
  /** `narrow` — компактное окно по центру (подсказки, заметки, вопросы «да/нет»). */
  size?: "narrow";
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEnterPrimary(ref);
  useWindowKey(
    (e) => {
      // поверх окна может быть подтверждение (`ask`) или открытый выпадающий список — Esc относится к ним
      if (e.key !== "Escape" || document.querySelector(".ask-backdrop, .sel__popup")) return;
      e.stopImmediatePropagation();
      onClose();
    },
    { capture: true },
  );
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`tabbed-modal ${tone ? `tabbed-modal--${tone}` : ""} ${size ? `tabbed-modal--${size}` : ""}`}>
        <FolderTabs tabs={tabs} active={active} onTab={onTab} onClose={onClose} className="folder--tabbed tabbed-modal__tabs" />
        <section ref={ref} className={`modal paper modal--wide modal--tabbed ${className}`} role="dialog" aria-modal="true">
          <div className="modal__body">{children}</div>
        </section>
      </div>
    </div>
  );
}

export function EvidenceCard({
  evidence,
  selected,
  onClick,
  compact,
  mark,
}: {
  evidence: Evidence;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  mark?: Mark;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      data-tone={evidence.kind}
      data-selected={selected || undefined}
      className={`evidence-card ${compact ? "is-compact" : ""} ${mark ? `is-${mark}` : ""}`}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      data-mark-key={evidence.id}
      data-title={evidence.title}
    >
      <span className="evidence-card__head">
        <span className="evidence-card__type" title={kindTitle(evidence)}>
          <Icon name={KIND_ICON[evidence.kind]} size={14} /> {KIND_LABEL[evidence.kind]}
        </span>
        {mark === "important" && <Icon name="star" size={14} title="Важное" />}
      </span>
      <strong className="evidence-card__title">{evidence.title}</strong>
      {!compact && <span className="evidence-card__desc">{evidence.description}</span>}
    </Tag>
  );
}

/** Результат сопоставления — такая же карточка, как улика. */
export function FactCard({
  deduction,
  selected,
  onClick,
  compact,
  mark,
}: {
  deduction: PublicDeduction;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  mark?: Mark;
}) {
  const Tag = onClick ? "button" : "div";
  const conclusion = useGame((s) => s.conclusions[deduction.id]);
  return (
    <Tag
      data-tone="conclusion"
      data-selected={selected || undefined}
      className={`evidence-card ${compact ? "is-compact" : ""} ${mark ? `is-${mark}` : ""}`}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      data-mark-key={`fact:${deduction.id}`}
      data-title={deduction.title}
    >
      <span className="evidence-card__head">
        <span className="evidence-card__type">
          <Icon name="fact" size={14} /> {KIND_LABEL.fact}
        </span>
        {mark === "important" && <Icon name="star" size={14} title="Важное" />}
      </span>
      <strong className="evidence-card__title">{deduction.title}</strong>
      {!compact && <span className="evidence-card__desc">{conclusion}</span>}
    </Tag>
  );
}

/** Достоверность словами и цветом. */
export function Reliability({ level }: { level: Evidence["reliability"] }) {
  return (
    <span className="reliability" data-tone={RELIABILITY_TONE[level]} title="Насколько можно доверять материалу">
      Достоверность: <b>{LEVEL[level]}</b>
    </span>
  );
}

/** Кнопки «Важно» / «Неважно» — повторный клик снимает пометку. */
export function MarkButtons({ markKey, mark }: { markKey: string; mark?: Mark }) {
  return (
    <span className="mark-buttons">
      <button className="mark-btn" aria-pressed={mark === "important"} onClick={() => actions.mark(markKey, "important")}>
        <Icon name="star" size={15} /> Важно
      </button>
      <button className="mark-btn" aria-pressed={mark === "unimportant"} onClick={() => actions.mark(markKey, "unimportant")}>
        <Icon name="dim" size={15} /> Неважно
      </button>
    </span>
  );
}
