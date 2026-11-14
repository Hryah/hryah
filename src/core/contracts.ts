// contracts.ts — спільні типи між трьома частинами гри.
// Тут ТІЛЬКИ типи, жодної логіки. Міняти цей файл можна лише через інтеграторів,
// бо від нього залежать усі три групи.
//
// Домовленість про одиниці: одиниця завжди в назві поля.
//   Kg, W, Wh, Mb (мегабіти), Mbps, MUsd (млн $), Ms (м/с), S (секунди), Km, M (метри)

// ───────────────────────── 1. Ідентифікатори ─────────────────────────

export type PhaseId = 'design' | 'flight' | 'orbit';
export type SystemId = 'propulsion' | 'power' | 'comms' | 'science' | 'thermal' | 'structure';

// ───────────────────────── 2. Журнал причин ─────────────────────────
// Кожна частина віддає не лише числа, а й записи «що сталося і через що».
// Розбір у кінці будує ланцюжок, ідучи по causedBy назад до рішення гравця.

export interface CauseEntry {
  id: string;                      // унікальний у межах забігу, напр. "design:instrument"
  phase: PhaseId;
  tS: number;                      // секунди від початку частини (0 для проєктування)
  kind: 'decision' | 'event' | 'warning' | 'failure';
  system: SystemId;
  messageKey: string;              // ключ у файлі текстів (тексти не хардкодимо: переклад)
  params?: Record<string, number | string>;
  causedBy?: string[];             // id попередніх записів, зокрема з попередніх частин
}

// ───────────────────────── 3. Місія (вхід гри) ─────────────────────────

export interface Body {
  name: string;
  radiusKm: number;
  muKm3S2: number;                 // гравітаційний параметр GM
}

export interface LauncherDef {
  id: string;
  nameKey: string;
  maxPayloadKg: number;
  costMUsd: number;
}

export interface Mission {
  id: string;
  titleKey: string;
  briefKey: string;
  body: Body;                      // навколо чого літаємо
  budgetMUsd: number;
  dvRequiredMs: number;            // скільки Δv треба, щоб вийти на робочу орбіту
  altRangeKm: [number, number];    // допустимі висоти орбіти
  requiredResolutionM: number;     // вимога науковців до чіткості знімка
  requiredDataMb: number;          // скільки даних треба доставити для перемоги
  durationOrbits: number;          // скільки витків триває частина 3
  imagingSPerOrbit: number;        // тривалість вікна зйомки за виток
  passSPerOrbit: number;           // тривалість прольоту над станцією за виток
  launchers: LauncherDef[];
}

// ───────────────────────── 4. Каталог модулів (дані) ─────────────────────────

interface ModuleBase {
  id: string;
  nameKey: string;
  massKg: number;
  costMUsd: number;
}

export interface EngineDef extends ModuleBase { slot: 'engine'; ispS: number }
export interface SolarDef extends ModuleBase { slot: 'solar'; powerW: number }
export interface BatteryDef extends ModuleBase { slot: 'battery'; capacityWh: number }
export interface AntennaDef extends ModuleBase { slot: 'antenna'; downlinkMbps: number; powerW: number }
export interface InstrumentDef extends ModuleBase {
  slot: 'instrument';
  apertureM: number;
  wavelengthM: number;
  dataRateMbps: number;
  powerW: number;
}

export type ModuleDef = EngineDef | SolarDef | BatteryDef | AntennaDef | InstrumentDef;
export type SlotId = ModuleDef['slot'];

export interface Catalog {
  modules: ModuleDef[];
}

// ───────────────────────── 5. Вихід частини 1 ─────────────────────────

// Те, що обрав гравець (сирі рішення).
export interface Design {
  modules: Record<SlotId, string>; // id модуля в кожному слоті
  fuelKg: number;
  altKm: number;
  launcherId: string;
}

// Запас підсистеми: «маю» проти «треба». Саме це малюють термінали.
export type MarginId = 'dv' | 'energy' | 'link' | 'science' | 'mass' | 'budget';

export interface Margin {
  id: MarginId;
  have: number;
  need: number;
  unit: string;
  ok: boolean;                     // рахує частина 1 (для science менше = краще, тому не просто have >= need)
}

// Опис апарата: усе, що потрібно частинам 2 і 3, уже пораховане.
export interface SpacecraftSpec {
  design: Design;
  // маса і двигун
  dryMassKg: number;
  fuelKg: number;
  wetMassKg: number;
  ispS: number;
  dvMs: number;
  // енергія
  panelPowerW: number;
  batteryWh: number;
  baseLoadW: number;               // бортовий комп'ютер тощо, вимкнути не можна
  heaterW: number;
  // зв'язок і дані
  downlinkMbps: number;
  transmitterW: number;
  bufferMb: number;
  // наука
  instrumentRateMbps: number;
  instrumentW: number;
  resolutionM: number;
  // гроші
  costMUsd: number;
  margins: Margin[];
}

// ───────────────────────── 6. Вихід частини 2 ─────────────────────────

export interface OrbitInfo {
  altKm: number;
  periodS: number;
  eclipseFraction: number;         // частка витка в тіні, 0..1
}

export interface Damage {
  system: SystemId;
  severity: number;                // 0..1, де 1 = система не працює
}

export interface FlightResult {
  orbit: OrbitInfo;                // куди реально вийшли
  fuelLeftKg: number;
  damage: Damage[];
}

// ───────────────────────── 7. Вихід частини 3 ─────────────────────────

export interface MissionOutcome {
  success: boolean;
  deliveredMb: number;
  survivedOrbits: number;
  score: number;
}

// ───────────────────────── 8. Єдиний інтерфейс частини ─────────────────────────
// Усі три частини реалізують один і той самий інтерфейс. Тому:
//   - step чиста (той самий стан + та сама дія = той самий результат): легко тестувати,
//     робити прогноз наперед і відтворювати забіг за сідом;
//   - заглушка = об'єкт із тим самим інтерфейсом, тож її заміна на справжню частину
//     не зачіпає решту коду.
// State і Action кожна група визначає сама; спільні лише In та Out.

export interface PhaseOutput<Out> {
  result: Out;
  log: CauseEntry[];
}

export interface Phase<In, State, Action, Out> {
  init(input: In, seed: number): State;
  step(state: State, action: Action): State;
  isDone(state: State): boolean;
  finish(state: State): PhaseOutput<Out>;
  // Необов'язково: які дії зараз можна зробити. Потрібно лише дебаг-екрану й ботам,
  // щоб грати в частину без справжнього інтерфейсу.
  debugActions?(state: State): DebugAction<Action>[];
}

export interface DebugAction<Action> {
  group: string;                   // під яким заголовком показати кнопку
  label: string;
  action: Action;
}

export interface DesignInput { mission: Mission; catalog: Catalog }
export interface FlightInput { mission: Mission; spec: SpacecraftSpec; log: CauseEntry[] }
export interface OrbitInput { mission: Mission; spec: SpacecraftSpec; flight: FlightResult; log: CauseEntry[] }

export type DesignPhase<State, Action> = Phase<DesignInput, State, Action, SpacecraftSpec>;
export type FlightPhase<State, Action> = Phase<FlightInput, State, Action, FlightResult>;
export type OrbitPhase<State, Action> = Phase<OrbitInput, State, Action, MissionOutcome>;

// ───────────────────────── 9. Запис забігу (вхід екрана розбору) ─────────────────────────

export interface RunRecord {
  seed: number;
  missionId: string;
  spec: SpacecraftSpec;
  flight: FlightResult;
  outcome: MissionOutcome;
  log: CauseEntry[];               // журнали всіх трьох частин підряд
}
