import { StageCanvas } from "../../render/StageCanvas";
import type { DesignState } from "../../core/design";
import { createDesignScene } from "../../scenes/design-scene";
import { designSceneView } from "../../scenes/views";
import { t } from "../text";

// Сцена апарата на стенді для екрана частини 1. Лише показує стан: кнопки лишаються звичайним HTML нижче.

const STAGE = { viewHeightUnits: 8 };

export function DesignStage({ state }: { state: DesignState }) {
  return (
    <div style={{ height: 320, borderRadius: 12, overflow: "hidden" }}>
      <StageCanvas createScene={createDesignScene} view={designSceneView(state)} options={STAGE}
        fallback={t("ui.render.noWebgl")} label={t("ui.designStage")} />
    </div>
  );
}
