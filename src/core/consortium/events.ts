// Події між вікнами кампанії: технологічний прорив (модуль різко дешевшає й з'являється раніше), зрив постачальника
// (модуль зникає з ринку на це вікно), зняття санкцій (країна знову купує заборонене), урядова програма (додатковий грант).
// Подія кидається від сіду кімнати й номера вікна, тож однакова для всіх агенцій і при повторі.

import type { Catalog, ModuleDef } from '../contracts';
import eventsData from '../../data/events.json';
import type { AgencyProfile } from '../design/agency';
import type { Market } from './market';
import { rolls } from './seed';

interface EventDef { id: string; kind: 'breakthrough' | 'disruption' | 'sanctionsLifted' | 'grant' | 'none'; weight: number; priceFactor?: number; grantMUsd?: number }
export const EVENTS = (eventsData as unknown as { events: EventDef[] }).events;

export interface CampaignEvent {
  round: number;            // вікно, у якому подія діє
  id: string;
  kind: EventDef['kind'];
  moduleId?: string;
  agencyId?: string;
  priceFactor?: number;
  grantMUsd?: number;
}

const pick = <T>(list: T[], r: number): T | undefined => list[Math.min(list.length - 1, Math.floor(r * list.length))];

// Подія для вікна round. Прорив і зрив стосуються модулів, що мають графік ринку (новинки); санкції — агенції з ними.
export function rollEvent(seed: number, round: number, catalog: Catalog, market: Market, agencies: AgencyProfile[]): CampaignEvent | null {
  const total = EVENTS.reduce((s, e) => s + e.weight, 0);
  const [r0, r1] = rolls(seed, `event|${round}`, 2) as [number, number];
  let acc = 0;
  const def = EVENTS.find((e) => (acc += e.weight / total) > r0) ?? EVENTS[EVENTS.length - 1];
  if (!def || def.kind === 'none') return null;
  const tracked = catalog.modules.filter((m) => market[m.id] !== undefined);
  if (def.kind === 'breakthrough' || def.kind === 'disruption') {
    const m = pick(tracked.length ? tracked : catalog.modules, r1);
    return m ? { round, id: def.id, kind: def.kind, moduleId: m.id, ...(def.priceFactor ? { priceFactor: def.priceFactor } : {}) } : null;
  }
  if (def.kind === 'sanctionsLifted') {
    const sanctioned = agencies.filter((a) => (a.blockedModules ?? []).length > 0);
    const a = pick(sanctioned, r1);
    return a ? { round, id: def.id, kind: def.kind, agencyId: a.id } : null;
  }
  return { round, id: def.id, kind: def.kind, grantMUsd: def.grantMUsd ?? 0 };
}

// Профіль агенції з урахуванням подій, що діють назавжди (зняття санкцій).
export function agencyAfterEvents(agency: AgencyProfile, events: CampaignEvent[]): AgencyProfile {
  return events.some((e) => e.kind === 'sanctionsLifted' && e.agencyId === agency.id) ? { ...agency, blockedModules: [] } : agency;
}

// Каталог вікна з урахуванням прориву й зриву поточного вікна. base — повний каталог (для раннього прориву).
export function catalogAfterEvents(modules: ModuleDef[], base: ModuleDef[], events: CampaignEvent[], round: number): ModuleDef[] {
  let out = modules;
  for (const e of events.filter((x) => x.round === round)) {
    if (e.kind === 'disruption') out = out.filter((m) => m.id !== e.moduleId);
    if (e.kind === 'breakthrough' && e.moduleId) {
      const factor = e.priceFactor ?? 1;
      const present = out.some((m) => m.id === e.moduleId);
      const source = base.find((m) => m.id === e.moduleId);
      if (present) out = out.map((m) => (m.id === e.moduleId ? { ...m, costMUsd: Math.round(m.costMUsd * factor * 100) / 100 } : m));
      else if (source) out = [...out, { ...source, costMUsd: Math.round(source.costMUsd * factor * 100) / 100 }];
    }
  }
  return out;
}
