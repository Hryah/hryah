// Кампанія: кілька вікон запуску поспіль у тій самій кімнаті. Тут лише чисті допоміжні частини, які не знають
// про сесію: налаштування, приховані умови місії, перевірка звіту гравця й повтор орбіти.
// Сама зміна раундів живе в session.ts (closeRound), бо їй потрібні записи агенцій.
//
// Чому звіт, а не довіра: політ іде на клієнті в реальному часі, тож його результат ми лише обмежуємо розумними
// межами. Орбіта покрокова й чиста, тому кімната перераховує її сама повтором дій гравця від спільного сіду.

import type {
  CauseEntry, Damage, FlightResult, Mission, MissionOutcome, PhaseOutput, SpacecraftSpec, SystemId,
} from '../contracts';
import { orbitInfo } from '../model';
import { orbitPhase, type OrbitAction } from '../orbit';
import { hashSeed, rolls } from './seed';

export interface CampaignConfig {
  rounds: number;              // скільки вікон запуску в кампанії
  windowTurns: number;         // скільки ходів триває одне вікно
  programGoal: number;         // ціль наукової програми в одиницях внеску (як runValueMUsd)
  grantMUsd: number;           // базовий грант на кожне наступне вікно
  missedGrantFactor: number;   // грант після пропущеного вікна
  missedTwiceGrantFactor: number; // грант після двох пропущених поспіль (sudden death)
  missedResearchPts: number;   // очки досліджень за пропущене вікно (аутсайдер іде в R&D)
  mbPerResearchPt: number;     // скільки доставлених мегабіт дає одне очко досліджень
}

export interface MissionReport {
  flight: FlightResult;
  orbitActions: OrbitAction[];
}

export const MAX_ORBIT_ACTIONS = 400;
const MAX_DAMAGE = 8;
const SYSTEMS: SystemId[] = ['propulsion', 'power', 'comms', 'science', 'thermal', 'structure'];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, k = 1) => Math.round(x * k) / k;

export function checkCampaign(c: CampaignConfig): void {
  const positive = ['rounds', 'windowTurns', 'programGoal', 'mbPerResearchPt'] as const;
  for (const key of positive) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`campaign.${key} має бути додатним числом`);
  }
  for (const key of ['grantMUsd', 'missedGrantFactor', 'missedTwiceGrantFactor', 'missedResearchPts'] as const) {
    if (!Number.isFinite(c[key]) || c[key] < 0) throw new Error(`campaign.${key} не може бути від'ємним`);
  }
}

// Справжні умови місії. Номінальна місія — те, що обіцяють науковці; справжня трохи гірша, і до першого запуску
// агенція про це не знає: прольоти над станцією коротші, вікно зйомки менше, на вихід на орбіту треба більше Δv.
// Множники від сіду кімнати, тож однакові для всіх агенцій.
export function hiddenMission(mission: Mission, seed: number): Mission {
  const [pass, imaging, dv] = rolls(seed, 'campaign:conditions', 3) as [number, number, number];
  return {
    ...mission,
    passSPerOrbit: round(mission.passSPerOrbit * (0.55 + 0.35 * pass)),
    imagingSPerOrbit: round(mission.imagingSPerOrbit * (0.75 + 0.25 * imaging)),
    dvRequiredMs: round(mission.dvRequiredMs * (1 + 0.35 * dv)),
  };
}

// Сіди польоту й орбіти агенції в раунді. Клієнт гравця грає з ними ж, тож повтор орбіти в кімнаті збігається.
export function missionSeeds(seed: number, agencyId: string, round: number): { flight: number; orbit: number } {
  return {
    flight: hashSeed(`${seed}|flight|${agencyId}|${round}`),
    orbit: hashSeed(`${seed}|orbit|${agencyId}|${round}`),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Форма звіту (для валідатора кімнати): лише типи й розміри, межі значень ставить sanitizeFlight.
export function isMissionReport(v: unknown): v is MissionReport {
  if (!isObj(v) || !isObj(v.flight) || !Array.isArray(v.orbitActions)) return false;
  const f = v.flight;
  if (!isObj(f.orbit) || !isNum(f.orbit.altKm) || !isNum(f.orbit.periodS) || !isNum(f.orbit.eclipseFraction)) return false;
  if (!isNum(f.fuelLeftKg) || !Array.isArray(f.damage)) return false;
  if (f.damage.length > MAX_DAMAGE || !f.damage.every((d) => isObj(d) && SYSTEMS.includes(d.system as SystemId) && isNum(d.severity))) return false;
  if (f.deploymentStatus !== undefined && f.deploymentStatus !== 'deployed' && f.deploymentStatus !== 'lost') return false;
  if (v.orbitActions.length > MAX_ORBIT_ACTIONS) return false;
  return v.orbitActions.every((a) => isObj(a) && (
    (a.type === 'tick' && isNum(a.dtS))
    || (a.type === 'toggle' && (a.id === 'camera' || a.id === 'transmitter' || a.id === 'heater' || a.id === 'safeMode'))
  ));
}

// Результат польоту від клієнта в розумних межах. Орбіту (період, тінь) не беремо від клієнта, а рахуємо з висоти.
// Лише відомі поля звіту: зайві властивості чужого JSON не потрапляють у стан кімнати.
export function pickReport(report: MissionReport): MissionReport {
  const f = report.flight;
  return {
    flight: {
      orbit: { altKm: f.orbit.altKm, periodS: f.orbit.periodS, eclipseFraction: f.orbit.eclipseFraction },
      fuelLeftKg: f.fuelLeftKg,
      damage: f.damage.map((d) => ({ system: d.system, severity: d.severity })),
      ...(f.deploymentStatus ? { deploymentStatus: f.deploymentStatus } : {}),
    },
    orbitActions: report.orbitActions.map((a) => (a.type === 'tick' ? { type: 'tick', dtS: a.dtS } : { type: 'toggle', id: a.id })),
  };
}

export function sanitizeFlight(mission: Mission, spec: SpacecraftSpec, flight: FlightResult): FlightResult {
  const [lo, hi] = mission.altRangeKm;
  // Нижня межа не вище за низьку орбіту невдалого польоту (~80 км), інакше реальна висота підмінялася б і повтор орбіти розійшовся.
  const altKm = clamp(flight.orbit.altKm, Math.max(1, Math.min(lo * 0.5, 80)), hi * 1.5);
  const damage: Damage[] = flight.damage.slice(0, MAX_DAMAGE).map((d) => ({ system: d.system, severity: clamp(d.severity, 0, 1) }));
  return {
    orbit: orbitInfo(mission.body, altKm),
    fuelLeftKg: clamp(flight.fuelLeftKg, 0, spec.fuelKg),
    damage,
    ...(flight.deploymentStatus ? { deploymentStatus: flight.deploymentStatus } : {}),
  };
}

const LOST: MissionOutcome = { success: false, deliveredMb: 0, survivedOrbits: 0, score: 0 };

// Повтор орбіти: ті самі дії від того самого сіду дають той самий результат, що бачив гравець.
// Якщо гравець не догравв орбіту, решта витків доганяється тиками з тими самими перемикачами.
export function replayOrbit(
  mission: Mission, spec: SpacecraftSpec, flight: FlightResult, log: CauseEntry[], actions: OrbitAction[], seed: number,
): PhaseOutput<MissionOutcome> {
  if (flight.deploymentStatus === 'lost') return { result: LOST, log: [] };
  let state = orbitPhase.init({ mission, spec, flight, log }, seed);
  for (const action of actions.slice(0, MAX_ORBIT_ACTIONS)) {
    if (orbitPhase.isDone(state)) break;
    state = orbitPhase.step(state, action);
  }
  for (let guard = 0; guard < 1000 && !orbitPhase.isDone(state); guard++) {
    const next = orbitPhase.step(state, { type: 'tick', dtS: state.input.flight.orbit.periodS });
    if (next === state) break;
    state = next;
  }
  return orbitPhase.finish(state);
}
