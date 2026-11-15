import { useMemo } from "react";
import { StageCanvas } from "../../render/StageCanvas";
import type { DesignState } from "../../core/design";
import { createDesignScene } from "../../scenes/design-scene";
import { designSceneView } from "../../scenes/views";
import { t } from "../text";
import type { Filter } from "../../render/filters";
import { gameFilters } from "../../render/style";
import { useRetro } from "../style/RetroStyle";

// Сцена апарата на стенді для екрана частини 1. Лише показує стан: кнопки лишаються звичайним HTML нижче.

const STAGE = { viewHeightUnits: 8 };
const NO_FILTERS: readonly Filter[] = [];

export function DesignStage({ state, active = true }: { state: DesignState; active?: boolean }) {
  const { on } = useRetro();
  // DPR може змінитись (вікно перенесли на інший монітор): перераховуємо, коли він інший.
  const dpr = globalThis.devicePixelRatio || 1;
  const retroFilters = useMemo(() => gameFilters(), [dpr]);
  return (
    <div style={{ height: 320, borderRadius: 12, overflow: "hidden" }}>
      <StageCanvas createScene={createDesignScene} view={designSceneView(state)} options={STAGE} active={active} filters={on ? retroFilters : NO_FILTERS}
        fallback={t("ui.render.noWebgl")} label={t("ui.designStage")} />
    </div>
  );
}
