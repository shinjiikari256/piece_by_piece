import { formatDate as formatDateStyle } from "../util/format";
import { SAVE_FORMAT_VERSION, migrateSave } from "../../../../shared/migrate";
import { listKeys, readJson, removeKey, writeJson } from "./storage";
import type { PublicCase } from "../../../../shared/public-case";
import type { Progress } from "../../../../shared/conditions";
import type { Answers } from "../../../../shared/scoring";

/**
 * Сохранение расследования в localStorage — отдельно для каждого дела.
 * Хранилище может быть недоступно (приватный режим, запрет сайта) —
 * тогда игра просто работает без сохранений.
 */

const PREFIX = "save:";
const VERSION = SAVE_FORMAT_VERSION;

export interface SaveData {
  v: typeof VERSION;
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

export function readSave(caseId: string): SaveData | null {
  const raw = readJson<unknown>(PREFIX + caseId, null);
  const m = raw ? migrateSave(raw) : null;
  const data = m?.ok ? (m.data as unknown as SaveData) : null;
  return data && data.caseId === caseId ? data : null;
}

export function writeSave(data: Omit<SaveData, "v" | "savedAt" | "player">): boolean {
  const player = readSave(data.caseId)?.player;
  return writeJson(PREFIX + data.caseId, { ...data, v: VERSION, savedAt: Date.now(), player });
}

/** Позицию игрока пишет сцена; только поверх уже существующего сохранения. */
export function savePlayerPosition(caseId: string, player: { x: number; y: number; locationId: string }) {
  const save = readSave(caseId);
  if (save) writeJson(PREFIX + caseId, { ...save, player });
}

/** Отметить паузу (выход в меню, закрытие страницы) поверх существующего сохранения. */
export function markPaused(caseId: string, at = Date.now()) {
  const save = readSave(caseId);
  if (save && !save.pausedAt) writeJson(PREFIX + caseId, { ...save, pausedAt: at });
}

export const clearSave = (caseId: string) => removeKey(PREFIX + caseId);

export function listSaves(): SaveData[] {
  const saves = listKeys(PREFIX).map((k) => readSave(k.slice(PREFIX.length)));
  return saves.filter((s): s is SaveData => !!s).sort((a, b) => b.savedAt - a.savedAt);
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
      followers: (save.progress.followers ?? []).filter((id) => characters.has(id)),
      npcPlaces: Object.fromEntries(
        Object.entries(save.progress.npcPlaces ?? {}).filter(([id, p]) => characters.has(id) && locations.has(p.locationId)),
      ),
    },
    examined: save.examined.filter((id) => objects.has(id)),
  };
}
