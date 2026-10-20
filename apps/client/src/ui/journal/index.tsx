import { useRef } from "react";
import { useArrowNav } from "../hooks";
import { actions, useGame, type JournalTab } from "../../state/store";

import { TabbedModal } from "../common";
import { type IconName } from "../icons";
import { Md } from "../md";
import { MaterialsTab } from "./materials";
import { CharactersTab } from "./characters";
import { LawTab } from "./law";
import { TimelineTab } from "./timeline";
import { timelineEnabled } from "../../../../../shared/events";
import { CaseCredit } from "../credit";
export const useCase = () => useGame((s) => s.caseFile)!;

export const JOURNAL_TABS: { id: JournalTab; label: string; icon: IconName }[] = [
  { id: "brief", label: "Вводная", icon: "folder" },
  { id: "materials", label: "Материалы", icon: "evidence" },
  { id: "timeline", label: "Хронология", icon: "clock" },
  { id: "characters", label: "Фигуранты", icon: "user" },
  { id: "law", label: "Закон", icon: "law" },
];

/** Карточки, по которым ходят ↑ / ↓: материалы и фигуранты (список слева, не подробности справа). */
const CARDS = ".materials__list button.evidence-card, .materials__list button.person-card";

export function Journal({ tab, match, focus }: { tab: JournalTab; match?: boolean; focus?: string }) {
  const content = useRef<HTMLDivElement>(null);
  const hasEvents = timelineEnabled(useCase());
  // пока на доске показаны варианты сопоставления, стрелки ходят по ним (match.tsx), а не по карточкам
  useArrowNav(content, CARDS, { active: () => !content.current?.querySelector(".deduction__options") });
  return (
    <TabbedModal
      tabs={JOURNAL_TABS.filter((t) => t.id !== "timeline" || hasEvents).map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
      active={tab}
      onTab={(id) => actions.open({ kind: "journal", tab: id as JournalTab })}
      className="journal"
    >
      <div className="journal__content" ref={content}>
        {tab === "brief" && <BriefTab />}
        {tab === "materials" && <MaterialsTab key={focus} match={!!match} focus={focus} />}
        {tab === "timeline" && <TimelineTab />}
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
