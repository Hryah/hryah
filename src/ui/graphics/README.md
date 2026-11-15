# Графічний адаптер та система темплейтів (`src/ui/graphics/`)

Цей модуль реалізує **розширювану адаптерну архітектуру візуальних темплейтів** для гри `hryah`.
Він повністю ізольований у `src/ui/` (відповідно до правила `core purity` з `REVIEW_RULES.md`) і автоматично перетворює чистий JSON-стан гри (`Design`, `SpacecraftSpec`, `FlightResult`, `Mission`) на 2D SVG-спрайти або інженерні векторні схеми (`blueprint`).

## Архітектура

1. **[`types.ts`](./types.ts)** — контракти темплейтів (`VisualTemplate`, `SpacecraftVisualAssembly`, `AttachmentSocket`, `ViewportContext`, `ITemplateRegistry`) та контракти розширень (`IGraphicsRendererRegistry`, `UnitRenderMode`, `BlueprintShapeRenderer`, `UnitRenderer`, `SlotCompositeRenderer`).
2. **[`registry.ts`](./registry.ts)** — центральний реєстр (`templateRegistry`), який завантажує `src/data/visual-templates.json`, підтримує карту `aliases` (наприклад, для ринкових чи кампанійних варіантів модулів), автоматично знаходить базу для `fab-*`, `cargo-*` і відомих небесних тіл (`Earth`, `Moon`, `Mars`) із безпечним фолбеком.
3. **[`renderer-registry.tsx`](./renderer-registry.tsx)** — реєстр розширень (`rendererRegistry`), через який можна підключати власні векторні `blueprint`-форми, кастомні режими відображення (наприклад, `'thermal'`, `'xray'` або майбутній `'3d'`) і кастомні рендерери слотів.
4. **[`adapters.tsx`](./adapters.tsx)** — компоненти `BlueprintShapeSvg`, `TemplateUnitView`, `EntityView` та `CompositeSpacecraftSvg` (динамічна збірка супутника на точках кріплення `SATELLITE_SOCKETS`, чистий векторний контур планет у режимі `blueprint`).
5. **[`SpacecraftViewport.tsx`](./SpacecraftViewport.tsx)** — готовий віджет інтерактивного 2D/Blueprint-в'юпорта для `ui/debug/` та інших екранів.

## Як розширити темплейтами, аліасами або кастомним режимом

1. Покладіть `.svg` файл у `public/assets/templates/` і додайте запис (або запис в `"aliases"`) у [`src/data/visual-templates.json`](../../data/visual-templates.json), або зареєструйте динамічно:

```ts
import { rendererRegistry, templateRegistry } from '../graphics';

templateRegistry.register({
  id: 'eng-plasma',
  category: 'module',
  slot: 'engine',
  system: 'propulsion',
  displayName: 'Плазмовий рушій',
  sprite2d: { url: 'assets/templates/design/eng-ion.svg', format: 'svg' },
  blueprint: {
    shape: 'engine-ion',
    primaryColor: '#1e293b',
    secondaryColor: '#60a5fa',
    accentColor: '#06b6d4',
    scaleFactor: 1.15,
    label: 'PLASMA',
  },
});

templateRegistry.registerAlias('eng-plasma-mk2', 'eng-plasma');

// За потреби — додатковий кастомний режим у в'юпорті:
rendererRegistry.registerModeOption({ id: 'thermal', label: 'Thermal' });
rendererRegistry.registerUnitRenderer('thermal', ({ template }) => (
  <span>{template.blueprint.label}</span>
));
```
