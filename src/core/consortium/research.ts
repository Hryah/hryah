// Дослідження: друга валюта кампанії. Очки дають доставлені дані й пропущені вікна (аутсайдер іде в R&D),
// витрачаються на вузли з data/research.json. Ефект змінює профіль агенції або її рахунок; далі все
// рахується звичайним кодом (ціни, розробка, ринок), тож нових правил у частинах гри немає.

import researchData from '../../data/research.json';
import type { AgencyProfile } from '../design/agency';
import type { Industry } from '../design/industry';

export type ResearchEffect =
  | { kind: 'industry'; industry: Industry; delta: number }
  | { kind: 'defect'; factor: number }
  | { kind: 'devSpeed'; factor: number }
  | { kind: 'marketLead'; turns: number }
  | { kind: 'scout' }
  | { kind: 'series'; refund: number };

export interface ResearchNode {
  id: string;
  nameKey: string;
  costPts: number;
  effect: ResearchEffect;
}

export const RESEARCH: Record<string, ResearchNode> = Object.fromEntries(
  Object.entries(researchData as unknown as Record<string, Omit<ResearchNode, 'id'>>).map(([id, n]) => [id, { id, ...n }]),
);

const round2 = (x: number) => Math.round(x * 100) / 100;

// Новий профіль агенції з ефектом вузла. Чиста: вхід не змінює.
export function applyResearch(agency: AgencyProfile, node: ResearchNode): AgencyProfile {
  const e = node.effect;
  switch (e.kind) {
    case 'industry':
      return { ...agency, industries: { ...agency.industries, [e.industry]: round2(Math.min(1, agency.industries[e.industry] + e.delta)) } };
    case 'defect':
      return { ...agency, defectFactor: round2((agency.defectFactor ?? 1) * e.factor) };
    case 'devSpeed':
      return { ...agency, devSpeedFactor: round2(agency.devSpeedFactor * e.factor) };
    case 'marketLead':
      return { ...agency, marketLeadTurns: (agency.marketLeadTurns ?? 0) + e.turns };
    case 'scout':
    case 'series':
      return agency; // ці вузли змінюють рахунок, а не профіль
  }
}
