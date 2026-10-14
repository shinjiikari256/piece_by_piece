import { useRef } from "react";
import { useArrowNav, useWindowKey } from "../hooks";
import { actions, useGame, type JournalTab } from "../../state/store";

import { TabbedModal } from "../common";
import { type IconName } from "../icons";
import { Md } from "../md";
import { MaterialsTab } from "./materials";
import { CharactersTab } from "./characters";
import { LawTab } from "./law";
import { CaseCredit } from "../credit";
export const useCase = () => useGame((s) => s.caseFile)!;

export const JOURNAL_TABS: { id: JournalTab; label: string; icon: IconName }[] = [
  { id: "brief", label: "Вводная", icon: "folder" },
  { id: "materials", label: "Материалы", icon: "evidence" },
  { id: "characters", label: "Фигуранты", icon: "user" },
  { id: "law", label: "Закон", icon: "law" },
];

/** Карточки, по которым ходят ↑ / ↓: материалы и фигуранты (список слева, не подробности справа). */
const CARDS = ".materials__list button.evidence-card, .materials__list button.person-card";

export function Journal({ tab, match, focus }: { tab: JournalTab; match?: boolean; focus?: string }) {
  const content = useRef<HTMLDivElement>(null);
  // пока на доске показаны варианты сопоставления, стрелки ходят по ним (match.tsx), а не по карточкам
  useArrowNav(content, CARDS, () => !content.current?.querySelector(".deduction__options"));
  useWindowKey((e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    const i = JOURNAL_TABS.findIndex((t) => t.id === tab);
    const next = JOURNAL_TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + JOURNAL_TABS.length) % JOURNAL_TABS.length];
    actions.open({ kind: "journal", tab: next.id });
  });

  return (
    <TabbedModal
      tabs={JOURNAL_TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
      active={tab}
      onTab={(id) => actions.open({ kind: "journal", tab: id as JournalTab })}
      className="journal"
    >
      <div className="journal__content" ref={content}>
        {tab === "brief" && <BriefTab />}
        {tab === "materials" && <MaterialsTab key={focus} match={!!match} focus={focus} />}
        {tab === "characters" && <CharactersTab key={focus} focus={focus} />}
        {tab === "law" && <LawTab />}
      </div>
    </TabbedModal>
  );
}

function BriefTab() {
  const caseFile = useCase();
  return (
    <article className="brief">
      <p className="brief__tagline">{caseFile.tagline}</p>
      <Md text={caseFile.introduction} />
      <CaseCredit meta={caseFile.meta} />
      <p className="muted">Места: {caseFile.locations.map((l) => l.name).join(" · ")}</p>
    </article>
  );
}
