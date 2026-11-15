// Сценарії кампанії з даних: яка місія, скільки вікон, яка ціль програми. Кімната знає всі сценарії,
// господар обирає один у лобі. Каталог кампанії ширший за каталог одиночної місії: нові модулі лежать
// окремо (catalog-extra.json), щоб не міняти баланс і перебори одиночного режиму.

import type { Catalog, Mission } from '../contracts';
import catalogData from '../../data/catalog.json';
import catalogExtraData from '../../data/catalog-extra.json';
import missionsData from '../../data/missions.json';
import scenariosData from '../../data/scenarios.json';
import type { AgencyProfile } from '../design/agency';
import type { CampaignConfig } from './campaign';
import type { Market } from './market';
import type { RoomSetup } from './room';

export interface ScenarioDef {
  id: string;
  titleKey: string;
  briefKey: string;
  missionId: string;
  campaign: CampaignConfig;
}

export interface ScenarioSetup {
  def: ScenarioDef;
  mission: Mission;
  campaign: CampaignConfig;
}

export const DEFAULT_SCENARIO = 'living-planet';

export const CAMPAIGN_CATALOG: Catalog = {
  modules: [...(catalogData as Catalog).modules, ...(catalogExtraData as Catalog).modules],
};

const missions = missionsData as unknown as Record<string, Mission>;

export const SCENARIOS: Record<string, ScenarioSetup> = Object.fromEntries(
  Object.entries(scenariosData as unknown as Record<string, Omit<ScenarioDef, 'id'>>).map(([id, raw]) => {
    const mission = missions[raw.missionId];
    if (!mission) throw new Error(`Сценарій ${id}: немає місії ${raw.missionId}`);
    return [id, { def: { id, ...raw }, mission, campaign: raw.campaign }];
  }),
);

// Налаштування кімнати кампанії: ширший каталог, усі сценарії, типовий сценарій без вибору.
// Одне місце для екрана й сервера кімнат, щоб вони не розійшлися.
export function campaignRoomSetup(market: Market, agencies: AgencyProfile[]): RoomSetup {
  const def = SCENARIOS[DEFAULT_SCENARIO]!;
  return { base: { mission: def.mission, catalog: CAMPAIGN_CATALOG }, market, agencies, campaign: def.campaign, scenarios: SCENARIOS };
}
