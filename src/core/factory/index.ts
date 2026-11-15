// Фабрика: шлях «сировина → переробка → обробка → готовий модуль» для п'яти ліній (по одній на слот).
// Правила (docs/EXPANSION.md):
//   - високорівневі пайплайни, не конвеєри: гравець обирає родовище й по одному кроку на двох стадіях;
//   - сировина країни має вади складу; одна вада видна одразу, друга прихована до аналізу проби чи першої партії;
//   - крок, що лікує ваду, піднімає якість; невилікувана вада її знижує; зайвий крок лише забирає час і гроші;
//   - дешева своя сировина з правильним маршрутом дає якість імпорту, тож краще не означає дорожче;
//   - три цехи (піч, хімцех, чиста кімната) мають обмежену потужність: це вузькі місця графа.
// Рандому немає: якість визначається маршрутом. Випадковість лишається лише в браку розробки (develop.ts).

import type { ModuleDef, SlotId } from '../contracts';
import materialsData from '../../data/materials.json';
import type { AgencyProfile } from '../design/agency';
import { capability, type Industry } from '../design/industry';
import { hashSeed } from '../consortium/seed';

export interface StepOption { nameKey: string; hintKey: string; cures: string[]; turns: number; costMUsd: number; workshop: WorkshopId }
export interface Deposit { nameKey: string; visible: string[]; hidden: string[]; costMUsd: number }
export interface Line {
  slot: SlotId;
  nameKey: string;
  flaws: Record<string, { nameKey: string }>;
  deposits: Record<string, Deposit>;
  stages: [Record<string, StepOption>, Record<string, StepOption>];
}
export type WorkshopId = 'furnace' | 'chem' | 'clean';
export interface MaterialsData {
  workshops: Record<WorkshopId, { nameKey: string; industry: Industry }>;
  flawPenalty: number;
  depositsPerAgency: number;
  analyzeCostMUsd: number;
  lines: Record<string, Line>;
}

export const MATERIALS = materialsData as unknown as MaterialsData;
export const IMPORT_DEPOSIT = 'import';

export interface FactoryOrder {
  line: string;
  depositId: string;
  steps: [string, string];  // варіант першої й другої стадії
  baseModuleId: string;     // який модуль каталогу робимо своїми силами
}

export interface Batch extends FactoryOrder {
  id: string;
  startTurn: number;
  readyTurn: number;
  costMUsd: number;
  quality: number;          // 0..1, видно гравцю лише коли партія готова
  uncured: string[];        // які вади лишились (теж видно після готовності)
  workshops: WorkshopId[];
  module: ModuleDef;
}

export interface FactoryState {
  batches: Batch[];
  analyzed: string[];       // `${line}:${deposit}`: проби, для яких відома прихована вада
}

export const emptyFactory = (): FactoryState => ({ batches: [], analyzed: [] });

const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Які родовища має країна на лінії: імпорт завжди, а з власних — depositsPerAgency штук, вибраних від id агенції.
export function depositsOf(agencyId: string, lineId: string, data: MaterialsData = MATERIALS): string[] {
  const line = data.lines[lineId];
  if (!line) return [];
  const own = Object.keys(line.deposits).filter((d) => d !== IMPORT_DEPOSIT);
  const ranked = [...own].sort((a, b) => hashSeed(`${agencyId}|${lineId}|${a}`) - hashSeed(`${agencyId}|${lineId}|${b}`));
  return [...ranked.slice(0, data.depositsPerAgency), ...(line.deposits[IMPORT_DEPOSIT] ? [IMPORT_DEPOSIT] : [])];
}

export const isReadyBatch = (b: Batch, turn: number) => turn >= b.readyTurn;

// Вади, які гравець знає: видимі завжди, прихована — після аналізу проби або першої готової партії з цього родовища.
export function knownFlaws(factory: FactoryState, lineId: string, depositId: string, turn: number, data: MaterialsData = MATERIALS): string[] {
  const dep = data.lines[lineId]?.deposits[depositId];
  if (!dep) return [];
  const revealed = factory.analyzed.includes(`${lineId}:${depositId}`)
    || factory.batches.some((b) => b.line === lineId && b.depositId === depositId && isReadyBatch(b, turn));
  return revealed ? [...dep.visible, ...dep.hidden] : [...dep.visible];
}

export function workshopCapacity(agency: AgencyProfile, ws: WorkshopId, data: MaterialsData = MATERIALS): number {
  return 1 + (agency.industries[data.workshops[ws].industry] >= 0.75 ? 1 : 0);
}

export function workshopLoad(factory: FactoryState, ws: WorkshopId, turn: number): number {
  return factory.batches.filter((b) => b.workshops.includes(ws) && b.startTurn <= turn && turn < b.readyTurn).length;
}

// Головна характеристика слота, яку покращує якість.
const MAIN_STAT: Record<SlotId, string> = {
  engine: 'ispS', solar: 'powerW', battery: 'capacityWh', antenna: 'downlinkMbps', instrument: 'dataRateMbps',
};

// Базовий модуль для id fab-<базовий id>-<агенція>-<n>: найдовший відомий id, з якого починається решта.
// Не покладається на відсутність дефісів в id агенції чи модуля.
export function fabBaseOf(id: string, knownIds: Iterable<string>): string | undefined {
  if (!id.startsWith('fab-')) return undefined;
  const rest = id.slice(4);
  let best: string | undefined;
  for (const k of knownIds) if (rest.startsWith(`${k}-`) && (!best || k.length > best.length)) best = k;
  return best;
}

// Модуль власного виробництва: з доброю партією кращий за каталожний, із поганою гірший; серійна ціна нижча.
export function fabModule(base: ModuleDef, quality: number, id: string): ModuleDef {
  const stat = MAIN_STAT[base.slot];
  const value = (base as unknown as Record<string, number>)[stat] ?? 0;
  return {
    ...base,
    id,
    nameKey: `fab.${base.nameKey}`,
    massKg: round2(base.massKg * (1.1 - 0.2 * quality)),
    costMUsd: round2(base.costMUsd * 0.6),
    [stat]: round2(value * (0.85 + 0.3 * quality)),
  } as ModuleDef;
}

export interface BatchPlan {
  ok: boolean;
  reason?: 'line' | 'deposit' | 'step' | 'module' | 'workshop';
  batch?: Batch;
}

// План партії без побічних ефектів: екран показує оцінку, ядро — те саме число.
export function planBatch(
  agency: AgencyProfile, factory: FactoryState, order: FactoryOrder, turn: number, catalog: ModuleDef[],
  data: MaterialsData = MATERIALS,
): BatchPlan {
  const line = data.lines[order.line];
  if (!line) return { ok: false, reason: 'line' };
  if (!depositsOf(agency.id, order.line, data).includes(order.depositId)) return { ok: false, reason: 'deposit' };
  const dep = line.deposits[order.depositId]!;
  const options = order.steps.map((s, i) => line.stages[i]?.[s]);
  if (options.length !== 2 || options.some((o) => !o)) return { ok: false, reason: 'step' };
  const [a, b] = options as [StepOption, StepOption];
  const base = catalog.find((m) => m.id === order.baseModuleId && m.slot === line.slot && !m.id.startsWith('fab-') && !m.id.startsWith('custom-'));
  if (!base) return { ok: false, reason: 'module' };
  const workshops = [...new Set([a.workshop, b.workshop])];
  if (workshops.some((ws) => workshopLoad(factory, ws, turn) >= workshopCapacity(agency, ws, data))) return { ok: false, reason: 'workshop' };

  const cured = new Set([...a.cures, ...b.cures]);
  const uncured = [...dep.visible, ...dep.hidden].filter((f) => !cured.has(f));
  const c = capability(agency.industries, line.slot);
  const quality = round2(clamp(1 - data.flawPenalty * uncured.length, 0.25, 1) * (0.85 + 0.15 * c));
  const turns = Math.max(1, Math.ceil((a.turns + b.turns) * agency.devSpeedFactor));
  const costMUsd = round2((dep.costMUsd + a.costMUsd + b.costMUsd) * agency.devCostFactor);
  const id = `fab-${base.id}-${agency.id}-${factory.batches.length + 1}`;
  return {
    ok: true,
    batch: {
      line: order.line, depositId: order.depositId, steps: [order.steps[0], order.steps[1]], baseModuleId: base.id,
      id, startTurn: turn, readyTurn: turn + turns, costMUsd, quality, uncured, workshops, module: fabModule(base, quality, id),
    },
  };
}

// Якість, яку гравець очікує, знаючи лише відомі вади (прихована може зіпсувати результат).
export function expectedQuality(agency: AgencyProfile, factory: FactoryState, order: FactoryOrder, turn: number, data: MaterialsData = MATERIALS): number | null {
  const line = data.lines[order.line];
  const a = line?.stages[0][order.steps[0]];
  const b = line?.stages[1][order.steps[1]];
  if (!line || !a || !b) return null;
  const cured = new Set([...a.cures, ...b.cures]);
  const uncured = knownFlaws(factory, order.line, order.depositId, turn, data).filter((f) => !cured.has(f));
  return round2(clamp(1 - data.flawPenalty * uncured.length, 0.25, 1) * (0.85 + 0.15 * capability(agency.industries, line.slot)));
}

// Готові модулі власного виробництва (додаються в каталог агенції).
export function readyModules(factory: FactoryState | undefined, turn: number): ModuleDef[] {
  return (factory?.batches ?? []).filter((b) => isReadyBatch(b, turn)).map((b) => b.module);
}

// Як найкраща готова партія оптичного скла впливає на брак дзеркала: добре скло зменшує ризик, погане збільшує.
export function glassDefectFactor(factory: FactoryState | undefined, turn: number): number {
  const glass = (factory?.batches ?? []).filter((b) => b.line === 'glass' && isReadyBatch(b, turn));
  if (glass.length === 0) return 1;
  const best = Math.max(...glass.map((b) => b.quality));
  return round2(1.3 - 0.6 * best);
}
