import type { UserStatus } from "../../../../shared/api";
import type { DialogueNode } from "../../../../shared/case";

/** Тон оформления (`data-tone`, styles/app/tone.css). */
export type Tone = "accent" | "good" | "warn" | "bad" | "evidence" | "testimony" | "conclusion";

/** Настроение реплики → тон; нейтральное — без тона. */
export const MOOD_TONE: Record<DialogueNode["mood"], Tone | undefined> = {
  neutral: undefined,
  friendly: "good",
  nervous: "warn",
  angry: "bad",
  sad: "accent",
};

/** Достоверность материала → тон. */
export const RELIABILITY_TONE = { high: "good", medium: "warn", low: "bad" } as const satisfies Record<string, Tone>;

/** Статус пользователя → тон. */
export const STATUS_TONE: Record<UserStatus, Tone> = { pending: "warn", active: "good", blocked: "bad" };
