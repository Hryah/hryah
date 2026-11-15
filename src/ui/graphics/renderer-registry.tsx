// renderer-registry.tsx — Розширюваний реєстр рендерерів для 2D/Blueprint та кастомних режимів.
// Дозволяє додавати нові векторні форми, кастомні режими відображення (наприклад, майбутній '3d' або 'thermal')
// та перевизначати рендер окремих слотів без змін у ядрі адаптерів.

import type { SlotId } from '../../core/contracts';
import type {
  BlueprintShapeId,
  BlueprintShapeRenderer,
  IGraphicsRendererRegistry,
  SlotCompositeRenderer,
  UnitRenderMode,
  UnitRenderer,
  ViewportModeOption,
} from './types';

export const DEFAULT_VIEWPORT_MODE_OPTIONS: readonly ViewportModeOption[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'sprite', label: '2D SVG' },
  { id: 'blueprint', label: 'Blueprint' },
];

/** Реєстр підключуваних рендерерів форм, режимів і слотів супутника */
export class GraphicsRendererRegistry implements IGraphicsRendererRegistry {
  private readonly blueprintShapes = new Map<string, BlueprintShapeRenderer>();
  private readonly unitRenderers = new Map<string, UnitRenderer>();
  private readonly slotRenderers = new Map<SlotId, SlotCompositeRenderer>();
  private readonly modeOptions: ViewportModeOption[];

  constructor(initialModes: readonly ViewportModeOption[] = DEFAULT_VIEWPORT_MODE_OPTIONS) {
    this.modeOptions = [...initialModes];
  }

  /** Реєструє або перевизначає процедурну векторну форму за її ID */
  registerBlueprintShape(shape: BlueprintShapeId, renderer: BlueprintShapeRenderer): void {
    this.blueprintShapes.set(shape, renderer);
  }

  /** Повертає кастомний рендерер векторної форми, якщо він зареєстрований */
  getBlueprintShape(shape: BlueprintShapeId): BlueprintShapeRenderer | undefined {
    return this.blueprintShapes.get(shape);
  }

  /** Реєструє кастомний рендерер одиниці для вказаного режиму (наприклад, 'thermal' або '3d') */
  registerUnitRenderer(mode: UnitRenderMode, renderer: UnitRenderer): void {
    this.unitRenderers.set(mode, renderer);
  }

  /** Повертає кастомний рендерер одиниці для вказаного режиму */
  getUnitRenderer(mode: UnitRenderMode): UnitRenderer | undefined {
    return this.unitRenderers.get(mode);
  }

  /** Реєструє кастомний рендерер слота на композитній схемі апарата */
  registerSlotRenderer(slot: SlotId, renderer: SlotCompositeRenderer): void {
    this.slotRenderers.set(slot, renderer);
  }

  /** Повертає кастомний рендерер слота на композитній схемі */
  getSlotRenderer(slot: SlotId): SlotCompositeRenderer | undefined {
    return this.slotRenderers.get(slot);
  }

  /** Додає або оновлює режим у переліку кнопок SpacecraftViewport */
  registerModeOption(option: ViewportModeOption): void {
    const existingIdx = this.modeOptions.findIndex((m) => m.id === option.id);
    if (existingIdx >= 0) {
      this.modeOptions[existingIdx] = option;
      return;
    }
    this.modeOptions.push(option);
  }

  /** Повертає доступні режими відображення для тулбара в'юпорта */
  listModeOptions(): readonly ViewportModeOption[] {
    return this.modeOptions;
  }
}

export const rendererRegistry = new GraphicsRendererRegistry();
