import type { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { registerCaseArt } from "../game/art";
import { checkArtLibrary, checkBindings, checkLooks, checkObjectSprites, checkSpriteVariables } from "./checks/art";
import { makeCheckers } from "./checks/conditions";
import { makeContext, type Ctx } from "./checks/context";
import { checkExits, checkMaps } from "./checks/maps";
import { checkQuestions, checkSolution } from "./checks/questions";
import { checkDeductions, checkDialogues, checkEffectSites, checkEvents, checkEvidence, checkFlags, checkHints, checkLaw } from "./checks/story";

export type ValidationResult = { ok: true; caseFile: CaseFile } | { ok: false; errors: string[] };

/** Структура по схеме + смысловые проверки, которые схема выразить не может. */
export function validateCase(raw: unknown): ValidationResult {
  const parsed = parseCase(raw);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  registerCaseArt(parsed.data);
  const errors = checkIntegrity(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, caseFile: parsed.data };
}

/** Порядок проверок важен: спрайты и тайлы — раньше всего (дальше читают `SPRITES[o.sprite]`), карты — до эффектов (им нужны полы и занятые клетки). */
function checkIntegrity(c: CaseFile): string[] {
  const errors: string[] = [];
  const err = (msg: string) => void errors.push(msg);

  checkArtLibrary(c, err);
  if (!checkObjectSprites(c, err)) return errors;
  checkSpriteVariables(c, err);
  checkBindings(c, err);

  const base = makeContext(c, errors);
  const ctx: Ctx = { ...base, ...makeCheckers(base) };
  checkLooks(base);
  checkMaps(ctx);
  checkExits(ctx);
  checkEvidence(ctx);
  checkDialogues(ctx);
  checkEffectSites(ctx);
  checkDeductions(ctx);
  checkFlags(ctx);
  checkLaw(ctx);
  checkHints(ctx);
  checkEvents(ctx);
  checkQuestions(ctx);
  checkSolution(ctx);

  return errors;
}
