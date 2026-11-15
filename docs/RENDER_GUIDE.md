# Як показати свою частину рушієм відображення

Практична інструкція для власників `design`, `flight`, `orbit` і їхніх агентів. Навіщо рушій такий, читай у `docs/RENDER_PLAN.md`. Тут лише як підключити. Код рушія читати не треба.

## 1. Три шари

Стан ядра (`src/core/<частина>`) → вид (чиста функція в `src/scenes/views.ts`) → сцена (цикл кадрів у `src/scenes/<частина>-scene.ts`).

- Ядро рахує гру. Про Three.js не знає.
- Вид перекладає стан у те, що треба показати: частки 0..1, прапорці, id модулів. Без Three.js і без ігрової логіки: усе беремо з ядра готовим.
- Сцена створює об'єкти один раз і щокадру плавно наближає їх до виду. Вона нічого не вирішує.

`src/render` не імпортує `src/core`. Сцени (`src/scenes`) можуть імпортувати типи й каталоги з ядра.

Свою сцену, свій вид і запис у галереї власник частини додає сам (див. `AGENTS.md`, розділ «Де можна писати»). Сам рушій `src/render/*` і `src/scenes/types.ts` міняються лише через Олексія.

## 2. Як підключити свою частину

### а) Вид і функція `стан → вид`

У `src/scenes/views.ts` опиши інтерфейс і чисту функцію (зразок: `OrbitView` / `orbitSceneView`, `DesignView` / `designSceneView`).

```ts
export interface FlightView {
  /** Частка пального, 0..1. */
  fuelFraction: number;
  burning: boolean;
}

export function flightSceneView(state: FlightState): FlightView {
  return { fuelFraction: clamp01(state.fuelKg / state.fuelStartKg), burning: state.burn.active };
}
```

(`FlightState`, `fuelKg` тут умовні: бери реальні поля свого стану.) У `src/scenes/views.test.ts` додай тест: початковий стан дає очікуваний вид, зміна стану змінює вид, частки лежать у 0..1. Одиниці в назвах полів: `Fraction`, `S`, `Units`.

### б) Сцена: `mount` / `update` / `dispose`

Інтерфейс (`src/scenes/types.ts`): `mount(stage: Stage)`, `update(view, dtS, timeS)`, `dispose()`. Усе створюється в `mount`, `update` лише рухає. Мінімальна сцена за зразком `test-scene.ts`:

```ts
import type * as THREE from 'three';
import { approach, pulse } from '../render/motion';
import { createBox, createStars, disposeObject, type Stars } from '../render/primitives';
import type { Stage } from '../render/stage';
import type { Scene } from './types';
import type { FlightView } from './views';

export function createFlightScene(): Scene<FlightView> {
  let rocket: THREE.Group | null = null;
  let stars: Stars | null = null;
  let fuel = 1;

  return {
    mount(stage: Stage) {
      rocket = createBox(1, 2, 1, 'hull');
      stars = createStars(300, 30, 4);
      stage.root.add(rocket, stars.points);
    },
    update(view, dtS, timeS) {
      if (!rocket || !stars) return;
      fuel = approach(fuel, view.fuelFraction, 3, dtS);
      rocket.position.y = fuel * 2 + 0.1 * Math.sin(timeS * 2);
      stars.material.opacity = 0.6 + 0.3 * pulse(timeS, 3);
    },
    dispose() {
      if (rocket) disposeObject(rocket);
      if (stars) disposeObject(stars.points);
      rocket = null;
      stars = null;
    },
  };
}
```

Камера нерухома, ортографічна, дивиться на (0, 0, 0). Видима висота за замовчуванням 10 світових одиниць (`viewHeightUnits`), ширина `stage.viewWidthUnits()`. Сцена світиться одним світлом зліва згори, тіней немає.

### в) Галерея

У `src/scenes/gallery.tsx`: додай id у `type EntryId` і масив `ENTRIES`, ключ `ui.gallery.<id>` у `src/data/texts.en.json`, функцію вигаданого виду та рядок у блоці `StageCanvas`.

```tsx
export function fakeFlightView(tS: number): FlightView {
  const cycleS = tS % 20;
  return { fuelFraction: 1 - cycleS / 20, burning: cycleS < 14 };
}
// у JSX:
{entry === 'flight' && (
  <StageCanvas createScene={createFlightScene} view={fakeFlightView(elapsedS)} fallback={fallback}
    filters={filters} label={t('ui.gallery.flight')} />
)}
```

Вигаданий вид сам змінюється в часі (`elapsedS` оновлюється 4 рази на секунду), тож сцену видно без гри.

### г) На екрані гри

Зразок: `src/ui/design/DesignStage.tsx`, використання: `<DesignStage state={state} active={active} />` у `DesignScreen.tsx`.

```tsx
const STAGE = { viewHeightUnits: 8 }; // рівень модуля: стабільне посилання

export function DesignStage({ state, active = true }: { state: DesignState; active?: boolean }) {
  return (
    <div style={{ height: 320, borderRadius: 12, overflow: 'hidden' }}>
      <StageCanvas createScene={createDesignScene} view={designSceneView(state)} options={STAGE} active={active}
        fallback={t('ui.render.noWebgl')} label={t('ui.designStage')} />
    </div>
  );
}
```

- `createScene` має бути функцією рівня модуля. Нова функція на кожен рендер перемонтує сцену.
- `options` і `filters` також стабільні (константа або `useMemo`). Зміна `viewHeightUnits` / `cameraElevationDeg` перемонтовує сцену. Зміна списку `filters` ні.
- Новий `view` на кожен рендер нормальний: сцена бере останній у наступному кадрі.
- Передавай `active` від перемикача екранів аж до `StageCanvas`: саме `display: none` не зупиняє цикл. `active={false}` скасовує кадри; повторне ввімкнення зберігає сцену й час без стрибка після паузи. До першого `active={true}` WebGL не створюється. За замовчуванням `active` дорівнює `true`.
- Контейнеру задай висоту: полотно займає 100% × 100%. Без WebGL показується `fallback`.
- Кнопки й текст лишаються звичайним HTML поруч, не на полотні. Сцена лише показує.

## 3. Довідник рушія (`src/render`)

| Модуль | Експорти | Коли |
|---|---|---|
| `motion.ts` | `clamp01`, `lerp`, `approach(cur, target, rate, dtS)`, `wrapAngle`, `angleDelta`, `approachAngle`, `pulse(timeS, periodS, phase?)`, `orbitAngle(timeS, periodS, startRad?)`, `onCircle(angleRad, radius)` → `{x, z}`, `inArc(angle, center, width)` | Плавні зміни й рух. Значення щокадру наближаємо до цілі через `approach`: `rate` у 1/с, не залежить від частоти кадрів. Не присвоювати з виду напряму. |
| `palette.ts` | `palette`, `css(name)`, `flatMaterial(name)`, `glowMaterial(name, opacity?)`, `lineMaterial(name, opacity?)` | Усі кольори. `flatMaterial` для освітлених об'єктів, `glowMaterial` для променів і світіння (без освітлення), `lineMaterial` для ліній, `css` для HTML поверх полотна. Новий колір додай у `palette`. |
| `primitives.ts` | `createBox`, `createPlanet`, `createOrbitRing`, `createArcSector`, `setArc`, `createStars`, `createBeam`, `setBeam`, `disposeObject` | Готові об'єкти для `mount`. `setArc(sector, centerRad, widthRad)` і `setBeam(beam, from, to)` змінюють об'єкт на місці й безпечні в `update`. Кінець сцени: `disposeObject` звільняє піддерево. |
| `sprites.ts` | `createSprite(id, spriteSource)`, `SpriteHandle` | Намальовані об'єкти. Повертає `{ object, material, setScale(k), isPlaceholder(), dispose() }`. |
| `filters.ts` | `Filter`, `pixelate`, `posterize`, `vignette`, `scanlines` | Дивись розділ 4. |
| `stage.ts` | `Stage`, `createStage` | Сцена отримує `Stage` (`root`, `camera`, `viewHeightUnits`, `viewWidthUnits()`, `toScreen(point, out)`). `toScreen` переводить точку світу в CSS-пікселі полотна: так HTML-підпис ставиться над об'єктом. `createStage` напряму не викликаємо, це робить `StageCanvas`. |

`createSprite(id, spriteSource)` викликай лише в `mount` (`spriteSource` з `src/scenes/sprite-source.ts`). id беремо з ядра (id модуля). Поки в `src/data/sprites.json` немає запису чи файла, показується заглушка: квадрат кольору з палітри (колір стабільний за id) з підписом id. Розмір і прив'язка беруться з маніфесту; якщо запису немає, це 1 одиниця з прив'язкою в центрі. Коли файл з'явиться, він підміняє заглушку після завантаження. `setScale(0..1)` корисний для плавної появи: `1` це розмір з маніфесту. Позицію ставимо через `sprite.object.position`, колір (підфарбування) через `sprite.material.color`. Вимоги до малюнків: `docs/SPRITES.md`.

## 4. Візуальні фільтри

`Filter` це постобробка готового кадру шейдером: `{ name, glsl, uniforms? }`. Сцени про фільтри не знають: вони вмикаються ззовні й діють на весь кадр.

Готові (кожна функція повертає новий фільтр): `pixelate(sizePx = 4)`, `posterize(levels = 5)`, `vignette(strength = 0.5)`, `scanlines(strength = 0.25)`.

```tsx
import { pixelate, vignette } from '../../render/filters';

const FILTERS = [pixelate(4), vignette(0.5)]; // рівень модуля або useMemo

<StageCanvas createScene={createFlightScene} view={view} fallback={fb} filters={FILTERS} />
```

- Фільтри застосовуються по черзі, у порядку списку.
- Порожній список або відсутній `filters` нічого не коштує: кадр іде прямо на екран, без проміжних буферів.
- Параметр можна міняти на льоту: `FILTERS[0].uniforms.uSize.value = 6`. Назви uniforms дивись у `filters.ts` (`uSize`, `uLevels`, `uStrength`).
- Повторне передавання тих самих об'єктів фільтрів у тому самому порядку не перестворює шейдери. Для зміни GLSL створюй новий об'єкт фільтра.
- Проміжні буфери створюються при першому ввімкненні фільтрів. Без `EXT_color_buffer_float` використовується RGBA8 замість half-float; MSAA вмикається лише з числом семплів, спільно підтримуваним форматами кольору й глибини (до 4).

Власний фільтр це GLSL з функцією `vec4 filterColor(sampler2D frame, vec2 uv)`. Доступні `uResolution` (vec2, піксели буфера) і `uTime` (секунди). Власні uniforms оголошуй у GLSL і в `uniforms`.

```ts
import type { Filter } from '../render/filters';

/** Чорно-біле зображення: amount 0..1 це частка знебарвлення. */
export const grayscale = (amount = 1): Filter => ({
  name: 'grayscale',
  uniforms: { uAmount: { value: amount } },
  glsl: /* glsl */ `
uniform float uAmount;
vec4 filterColor(sampler2D frame, vec2 uv) {
  vec4 c = texture2D(frame, uv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  return vec4(mix(c.rgb, vec3(l), uAmount), c.a);
}`,
});
```

Фільтр можна покласти в `filters.ts` або поруч зі своєю частиною. Тип значення uniform: `number`, `THREE.Color`, `THREE.Vector2` або `THREE.Vector3`. Колір для фільтра бери з `palette`, не пиши hex у GLSL.

## 5. Правила й пастки

- У `update` не створювати об'єкти, геометрії й матеріали. Усе в `mount`, у `update` лише міняємо властивості. Для дуг і променів є `setArc` / `setBeam`.
- `dispose` прибирає все, що створив `mount`: `disposeObject` для груп, `handle.dispose()` для спрайтів, окремі матеріали й текстури теж.
- `dispose` має витримувати частково виконаний `mount`: обгортка викликає очищення сцени й stage також при помилці монтування. Під час звичайної паузи ресурси зберігаються до демонтування.
- `setBeam` сам показує промінь ненульової довжини й ховає його при збігу кінців; окреме вимкнення через ігровий стан лишається справою сцени.
- Кольори лише з палітри (`palette`, `css`, `*Material`). Прямого hex у сцені немає.
- Статична картинка це помилка: у сцені завжди є хоч мала рухома деталь (погойдування, пульсація зір).
- Спрайт це площина, завжди повернута до камери, з однією глибиною на весь спрайт. Накладені спрайти шаруй явно: `sprite.material.depthTest = false; sprite.material.depthWrite = false; sprite.object.renderOrder = N`. Так робить `design-scene.ts` (функція `layer`). Зсув по `z` не допомагає.
- Ігрова логіка живе в ядрі. Функція виду лише переформатовує стан. Рандом і час у виді не використовуємо.
- Тексти для гравця не в сцені: ключі в `src/data/texts.en.json`, виклик `t(...)`.
- Цикл кадрів зупиняється, коли полотно прихований (розмір 0): час сцени тоді не йде і `update` не викликається. Не розраховуй на `update` для ігрового часу, він іде з ядра.
- `src/render` не імпортує `src/core`. Якщо треба дані з ядра, передай їх через вид.

## 6. Як перевіряти

1. `npm run dev`, відкрий `#gallery`, обери свою сцену. Ввімкни фільтри й переконайся, що картинка лишається читабельною.
2. Зроби два скриншоти з різницею в кілька секунд: вони мають відрізнятись (рух, зміни виду). Однакові це помилка.
3. Відкрий свій екран гри й перевір, що сцена реагує на дії гравця.
4. Перед «готово»: `npm run typecheck`, `npm test`, `npm run build`. Усе зелене.
