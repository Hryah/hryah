# Графічний адаптер та система темплейтів (`src/ui/graphics/`)

Цей модуль реалізує **адаптерну архітектуру візуальних темплейтів** для гри `hryah`.
Він повністю ізольований у `src/ui/` (відповідно до правила `core purity` з `REVIEW_RULES.md`) і автоматично перетворює чистий JSON-стан гри (`Design`, `SpacecraftSpec`, `FlightResult`, `Mission`) на візуальне представлення.

## Архітектура

1. **[`types.ts`](./types.ts)** — контракти темплейтів (`VisualTemplate`, `SpacecraftVisualAssembly`, `AttachmentSocket`, `ViewportContext`, `ITemplateRegistry`).
2. **[`registry.ts`](./registry.ts)** — центральний реєстр (`templateRegistry`), який прив'язує ID модулів (`eng-*`, `sol-*`, `bat-*`, `ant-*`, `cam-*`), ракет-носіїв (`small`, `medium`, `heavy`) та небесних тіл (`Earth`, `Moon`) до:
   - **3D-моделей `.glb`** (`model3d.url` у `public/assets/models/...`);
   - **2D-спрайтів та текстур планет** (`sprite2d.url`, `planetTextures.dayMapUrl` у `public/assets/textures/...`);
   - **Вбудованих інженерних SVG-схем (`blueprint`)** — гарантують, що будь-який модуль (навіть щойно доданий у `catalog.json` без 3D-моделі) відмальовується без помилок.
3. **[`glb-viewer.tsx`](./glb-viewer.tsx)** — вбудований парсер бінарного формату `glTF 2.0 (.glb)` та інтерактивний 3D-рендерер на чистому `<canvas>` (обертання мишею, освітлення, нормалізація сітки) без потреби додавати важкі залежності в `package.json`.
4. **[`adapters.tsx`](./adapters.tsx)** — компоненти `TemplateUnitView` (перемикач `Auto` / `3D GLB` / `2D/Tex` / `Blueprint` із автоматичним фолбеком) та `CompositeSpacecraftSvg` (динамічна збірка супутника на точках кріплення `SATELLITE_SOCKETS`).
5. **[`SpacecraftViewport.tsx`](./SpacecraftViewport.tsx)** — готовий віджет в'юпорта, який можна вставити на екрани `ui/design/`, `ui/flight/`, `ui/orbit/` або `ui/debug/`.

## Як прив'язати нову модель або спрайт

1. Покладіть `.glb` файл у `public/assets/models/modules/` (або `.png` у `public/assets/sprites/modules/`).
2. У файлі [`registry.ts`](./registry.ts) вкажіть шлях у відповідному об'єкті, або зареєструйте динамічно:

```ts
import { templateRegistry } from '../graphics';

templateRegistry.register({
  id: 'eng-ion',
  category: 'module',
  slot: 'engine',
  system: 'propulsion',
  displayName: 'Іонний двигун NASA NEXT-C',
  model3d: { url: '/assets/models/modules/my_custom_ion.glb', format: 'glb', scale: 1.0 },
  blueprint: {
    shape: 'engine-ion',
    primaryColor: '#1e293b',
    secondaryColor: '#60a5fa',
    accentColor: '#06b6d4',
    scaleFactor: 1.15,
    label: 'ION-NEXT',
  },
});
```
