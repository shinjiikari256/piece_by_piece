import { formatDate as formatDateStyle } from "../util/format";
import { SAVE_FORMAT_VERSION } from "../../../../shared/migrate";
import type { PublicCase } from "../../../../shared/public-case";
import { initialEnums, type Progress } from "../../../../shared/conditions";
import type { Answers } from "../../../../shared/scoring";

/** Сохранение расследования: что лежит в хранилище платформы (формат — `SAVE_FORMAT_VERSION`) и чистые функции над ним. */

export interface SaveData {
  v: typeof SAVE_FORMAT_VERSION;
  caseId: string;
  savedAt: number;
  screen: "play" | "final";
  startedAt?: number | null;
  progress: Progress;
  examined: string[];
  marks?: Record<string, "important" | "unimportant">;
  usedChoices: string[];
  wrongDeductions: number;
  playerNotes: string;
  hintsUsed: number;
  answers: Answers;
  locationId: string;
  /** Версия дела (его updatedAt), на которой сделано сохранение. */
  caseUpdatedAt?: string;
  player?: { x: number; y: number; locationId: string };
  /** Когда игрок вышел из дела: время отсутствия не идёт в зачёт таймера. */
  pausedAt?: number;
}

/** Дело поменяли после сохранения — продолжать нельзя: улики, диалоги и карта могли измениться. */
export function isSaveOutdated(save: SaveData, c: PublicCase): boolean {
  return (save.caseUpdatedAt ?? "") !== (c.updatedAt ?? "");
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "неизвестно когда";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : formatDateStyle(d, true);
}

/** Дело могли отредактировать после сохранения — выбрасываем ссылки на исчезнувшее. */
export function sanitizeSave(save: SaveData, c: PublicCase): SaveData {
  const evidence = new Set(c.evidence.map((e) => e.id));
  const deductions = new Set(c.deductions.map((d) => d.id));
  const objects = new Set(c.locations.flatMap((l) => l.objects.map((o) => o.id)));
  const locations = new Set(c.locations.map((l) => l.id));
  const characters = new Set(c.characters.map((ch) => ch.id));
  return {
    ...save,
    progress: {
      ...save.progress,
      collected: save.progress.collected.filter((id) => evidence.has(id)),
      deductions: save.progress.deductions.filter((id) => deductions.has(id)),
      characterNotes: Object.fromEntries(
        Object.entries(save.progress.characterNotes).filter(([id]) => characters.has(id)),
      ),
      counters: Object.fromEntries(Object.entries(save.progress.counters ?? {}).filter(([id]) => (c.counters ?? []).some((x) => x.id === id))),
      // значения перечислений: сохранённые, если значение ещё есть в деле; иначе начальное
      enums: Object.fromEntries(
        Object.entries(initialEnums(c.enums)).map(([id, start]): [string, string] => {
          const saved = save.progress.enums?.[id];
          return [id, saved !== undefined && (c.enums ?? []).find((e) => e.id === id)?.values.some((v) => v.id === saved) ? saved : start];
        }),
      ),
      chosen: save.progress.chosen ?? save.usedChoices ?? [],
      followers: (save.progress.followers ?? []).filter((id) => characters.has(id)),
      fired: (save.progress.fired ?? []).filter((key) => c.locations.some((l) => key.startsWith("once:") || l.zones.some((z) => key.startsWith(`${z.id}:`)))),
      npcPlaces: Object.fromEntries(
        Object.entries(save.progress.npcPlaces ?? {}).filter(([id, p]) => characters.has(id) && locations.has(p.locationId)),
      ),
    },
    examined: save.examined.filter((id) => objects.has(id)),
  };
}
