import type { CaseFile } from "../../../../shared/case";
import { CASE_FORMAT_VERSION } from "../../../../shared/migrate";

/** Минимальное дело, которое сразу проходит валидацию: от него удобно отталкиваться. */
export function blankCase(): CaseFile {
  const tiles = [
    "####################",
    ...Array.from({ length: 4 }, () => "#,,,,,,,,,#........#"),
    "#,,,,,,,,,D........#",
    ...Array.from({ length: 5 }, () => "#,,,,,,,,,#........#"),
    "####################",
  ];
  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: `case-new-${Date.now().toString(36)}`,
    number: "000",
    title: "Новое дело",
    tagline: "Коротко о сути дела",
    introduction: "Что случилось и кто обратился в полицию.\n\nПроверку поручили вам — дознавателю.",
    difficulty: "medium",
    timeBonus: { minutes: 15, points: 10, minScore: 75 },
    published: false,
    locations: [
      {
        id: "main",
        name: "Место происшествия",
        tiles,
        areas: [{ name: "Кабинет", x: 5, y: 10 }],
        playerStart: { x: 15, y: 5 },
        objects: [
          {
            id: "obj_desk",
            sprite: "desk",
            x: 3,
            y: 3,
            label: "Стол",
            interaction: { type: "evidence", title: "Стол", description: "На столе лежит документ.", evidenceId: "ev_document" },
          },
          {
            id: "obj_board",
            sprite: "board",
            x: 13,
            y: 0,
            label: "Доска",
            interaction: { type: "evidence", title: "Доска объявлений", description: "Приколот документ.", evidenceId: "ev_rule" },
          },
        ],
        npcs: [{ id: "npc_witness", characterId: "witness", dialogueId: "dlg_witness", x: 12, y: 8 }],
        exits: [],
        doors: [],
      },
    ],
    characters: [
      { id: "witness", name: "Свидетель", look: "casual_m", position: "кто он", description: "Что о нём известно." },
    ],
    events: [{ id: "ev_main", time: "1 января", title: "Главное событие" }],
    evidence: [
      {
        id: "ev_document",
        title: "Документ",
        description: "Кратко: что доказывает.",
        details: "Полный текст документа.",
        kind: "evidence",
        subtype: "Документ",
        relatedCharacters: ["witness"],
        relatedEvents: ["ev_main"],
        reliability: "high",
      },
      {
        id: "ev_rule",
        title: "Правило",
        description: "Что запрещено.",
        details: "Текст правила.",
        kind: "evidence",
        subtype: "Документ",
        relatedCharacters: [],
        relatedEvents: [],
        reliability: "high",
      },
    ],
    dialogues: [
      {
        id: "dlg_witness",
        characterId: "witness",
        startNodeId: "start",
        nodes: [
          {
            id: "start",
            text: "Здравствуйте.",
            mood: "neutral",
            effects: [],
            choices: [
              { id: "ask", text: "Что вы видели?", next: "answer" },
              { id: "bye", text: "До свидания.", next: null },
            ],
          },
          {
            id: "answer",
            text: "Ответ свидетеля.",
            mood: "neutral",
            effects: [],
            choices: [{ id: "back", text: "Понятно.", next: "start" }],
          },
        ],
      },
    ],
    confrontations: [],
    deductions: [
      {
        id: "d_main",
        title: "Вывод",
        evidenceIds: ["ev_document", "ev_rule"],
        question: "Что следует из документа и правила?",
        options: [
          { id: "a", text: "Верный вывод", correct: true, feedback: "Почему верно." },
          { id: "b", text: "Неверный вывод", correct: false, feedback: "Почему неверно." },
        ],
        conclusion: "Установленный вывод.",
        effects: [],
      },
    ],
    hints: [
      { level: 1, text: "Подсказка про объект.", penalty: 5 },
      { level: 2, text: "Подсказка про связь улик.", penalty: 7 },
      { level: 3, text: "Подсказка про право.", penalty: 10 },
    ],
    questions: [
      {
        id: "q_right",
        category: "right",
        prompt: "Какое право затронуто?",
        kind: "single",
        source: "inline",
        maxPoints: 30,
        options: [
          { id: "privacy", label: "Право на неприкосновенность частной жизни", points: 30, mark: "", feedback: "" },
          { id: "other", label: "Другое право", points: 0, mark: "", feedback: "" },
        ],
      },
      {
        id: "q_violation",
        category: "violation",
        prompt: "Было ли нарушение?",
        kind: "single",
        source: "inline",
        maxPoints: 15,
        options: [
          { id: "yes", label: "Да", points: 15, mark: "", feedback: "" },
          { id: "no", label: "Нет", points: 0, mark: "", feedback: "" },
          { id: "insufficient", label: "Недостаточно информации", points: 5, mark: "", feedback: "" },
        ],
      },
      {
        id: "q_qualification",
        category: "qualification",
        prompt: "Как можно квалифицировать действия виновного?",
        kind: "single",
        source: "inline",
        maxPoints: 15,
        options: [
          { id: "criminal", label: "Признаки преступления", points: 15, mark: "", feedback: "" },
          { id: "none", label: "Правонарушения нет", points: 0, mark: "", feedback: "" },
        ],
      },
      {
        id: "q_responsible",
        category: "responsible",
        prompt: "Кто несёт ответственность?",
        kind: "single",
        source: "characters",
        maxPoints: 20,
        options: [{ id: "witness", label: "", points: 20, mark: "", feedback: "" }],
      },
      {
        id: "q_evidence",
        category: "evidence",
        prompt: "Какие доказательства это подтверждают?",
        kind: "multi",
        source: "evidence",
        maxPoints: 20,
        options: [
          { id: "ev_document", label: "", points: 15, mark: "", feedback: "" },
          { id: "ev_rule", label: "", points: 5, mark: "", feedback: "" },
        ],
      },
    ],
    solution: {
      right: "privacy",
      rightText: "Какое право затронуто и на какой норме это основано.",
      violation: true,
      responsibleCharacter: "witness",
      correctAnswer: "Краткий правильный ответ.",
      whatHappened: "Что произошло на самом деле.",
      explanation: "Почему это нарушение.",
      legalQualification: "Возможная квалификация.",
      qualificationNotes: [],
      keyEvidence: [{ evidenceId: "ev_document", why: "Почему важно." }],
      sources: ["Нормативный акт или литература"],
    },
  };
}
