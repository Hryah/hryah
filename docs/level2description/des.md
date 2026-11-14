# Технічна специфікація та архітектура Частини 2 (2D Zero-G Платформер)

Повна технічна специфікація та архітектура системи (включно з точною математикою, контрактами даних, життєвим циклом кадру та правилами блокування вводу), яка повністю виключає патерн «веб-сайту» і будує справжній 2D Zero-G платформер.

## 1. Головні архітектурні інваріанти (Жорсткі правила системи)

1. **Заборона Point-and-Click навігації:** координати кліку миші **ніколи** не використовуються як цільова точка переміщення (`targetX, targetY`). Миша керує виключно вектором натягу рогатки відносно поточної точки фіксації гравця.
2. **Повноекранний ігровий Viewport:** кореневий контейнер гри примусово має `width: 100vw; height: 100vh; overflow: hidden; user-select: none;`. Жодних бічних панелей, HTML-списків задач чи кнопок «Полетіти в модуль Х».
3. **Розділення Світу та Екрану (World Space vs Screen Space):** гра підтримує віртуальну камеру `Camera2D`. Оскільки станція розростається під час 3-х стикувань, світ значно більший за екран. Камера плавно слідує за гравцем у світових координатах.
4. **Незупинна симуляція (FNAF-інваріант):** відкриття мінігри **не ставить гру на паузу**. Головний цикл `SimulationLoop` продовжує списувати кисень, нагрівати станцію і рухати таймери аварій, поки гравець крутить вентилі в модальному вікні мінігри.

## 2. Матриця станів та маршрутизація вводу (Input & State Isolation)

| Стан системи (`GameMode`) | Хто отримує події миші/клавіатури | Стан `SimulationLoop` (Фізика і Таймери) | Камера (`Camera2D`) |
| --- | --- | --- | --- |
| `STATION_ROAM` | `SlingshotController` (якщо `ANCHORED`) або `GrabController` (якщо `FLYING`) | Активний (`1.0x dt`) | Слідує за `Astronaut` (`lerp = 0.08`) |
| `MINIGAME_ACTIVE` | Виключно активний інстанс `MinigameController` | Активний (`1.0x dt`) — ресурси продовжують падати! | Зафіксована на `TerminalNode` (легкий зум `1.2x`) |
| `MODULE_EXPANSION_CUTSCENE` | Ввід заблоковано (1.5 секунди) | Таймери криз на паузі, фізика активна | Панорамування на новий пристикований модуль (`Zoom 0.7x`) |
| `GAME_OVER / VICTORY` | Екран результатів | Зупинено (`0.0x dt`) | Статична |

## 3. Контракти даних та структури сутностей (Data Schemas)

### 3.1. Гравець (`AstronautEntity`)

```typescript
type AstronautState = 'ANCHORED' | 'FLYING' | 'STUNNED';

interface AstronautEntity {
  pos: { x: number; y: number };
  vel: { vx: number; vy: number };
  radius: number;                  // 22px
  angle: number;                   // радіани
  angularVel: number;

  state: AstronautState;
  anchoredHandleId: string | null;
  lastHandleId: string | null;
  ignoreHandleTimer: number;       // 0.25с після старту польоту
  stunTimer: number;               // 0.8с при ударі на надшвидкості

  slingshot: {
    isDragging: boolean;
    dragStartScreen: { x: number; y: number };
    dragCurrentScreen: { x: number; y: number };
    launchVector: { vx: number; vy: number };
  };

  thrusterCharges: number;         // Максимум 3 на рівень
}
```

### 3.2. Геометрія станції та граф розширення (`StationTopology`)

```typescript
type ModuleType = 'HORIZONTAL' | 'VERTICAL' | 'INTERSECTION' | 'COMMAND';

interface WallSegment {
  id: string;
  ax: number; ay: number;
  bx: number; by: number;
  normal: { nx: number; ny: number };
  isDockingSeal?: string;
}

interface GrabHandle {
  id: string;
  moduleId: string;
  ax: number; ay: number;
  bx: number; by: number;
  grabRadius: number;              // 32px
  terminalId: string | null;
}

interface TerminalNode {
  id: string;
  moduleId: string;
  handleId: string;
  type: 'DOCKING' | 'SOLAR' | 'OXYGEN' | 'THERMAL';
  pos: { x: number; y: number };
  state: 'IDLE' | 'WARNING' | 'CRITICAL' | 'COMPLETED';
  urgencyTimer: number;
}
```

## 4. Фізичний рушій невагомості та балістика (`ZeroGPhysicsEngine`)

- Натяг рогатки: $\vec{D} = \vec{P}_{start} - \vec{P}_{current}$, $L_{max} = 180\text{ px}$, $V_{max} = 650\text{ px/s}$, $\vec{V}_{launch} = \hat{d} \cdot (L / L_{max})^{1.2} \cdot V_{max}$.
- Траєкторія: $N = 10$ точок $\vec{P}_i = \vec{P}_{player} + \vec{V}_{launch} \cdot (i \cdot 0.04\text{ s})$.
- Політ: $\vec{P}_{new} = \vec{P} + \vec{V} \cdot dt$, $\vec{V}_{new} = \vec{V} \cdot (1 - 0.08 \cdot dt)$.
- Колізії `Circle-to-Segment`: відбиття з $e = 0.65$; якщо $|\vec{V} \cdot \vec{N}| > 480\text{ px/s}$ — `STUNNED` на $0.8\text{ s}$.
- Захват ручок-капсуль ($R_{grab} = 32\text{ px}$): безпечний захват при $\|\vec{V}\| \le 420\text{ px/s}$ або при утриманні `Space`/`ЛКМ`; зрив захвату при $\|\vec{V}\| > 550\text{ px/s}$ без реакції ($\vec{V} \leftarrow \vec{V} \cdot 0.7$).

## 5. Динамічне розширення карти (3 етапи стикування)

- **Старт (`0:00`)**: Модуль 1 (Horizontal, Термінал Сон. Панелей) + Модуль 2 (Хаб Intersection, кутові ручки 45°, 3 шлюзи).
- **Хвиля 1 (`0:40` — Стикування №1)**: Східний шлюз `DOCKING_1` -> відкриває Модуль 3 (Енергетика, Термінал Охолодження + центральна перешкода).
- **Хвиля 2 (`2:00` — Стикування №2)**: Північний шлюз `DOCKING_2` -> відкриває Модуль 4 (Вертикальний СЖЗ, Термінал O2/CO2).
- **Хвиля 3 (`3:30` — Фінальне Стикування №3)**: Південний шлюз `DOCKING_3` + подвійний збій (Сонячні панелі + Кисень) -> відкриває Модуль 5 (Командний місток -> ПЕРЕМОГА).

## 6. Специфікація ізольованих мініігор

1. `DockingMinigame` — оптичний приціл СОІ, утримання мішені в радіусі $R < 25\text{ px}$ поки $Z: 10\text{ м} \to 0\text{ м}$ (~12 с).
2. `SolarArrayMinigame` — два кругові радари ($\alpha, \beta$), осцилограф потужності, перегрів мотора при перевищенні $\omega_{max}$ (клин на 3 с), утримання $>95\%$ протягом 3.0 с.
3. `LifeSupportMinigame` — заміна червоного фільтра CO2 на зелений, поворот вентиля аміаку на $360^\circ$, нагнітання тиску O2 у зелений сектор $70\text{–}85\text{ кПа}$ (скидання при $>90\text{ кПа}$).

## 7. Декомпозиція модулів

1. `GameLoop.ts`
2. `Camera2D.ts`
3. `ZeroGPhysics.ts`
4. `StationBlueprint.ts`
5. `CrisisAndDockingDirector.ts`
6. `minigames/DockingGame.ts`, `SolarGame.ts`, `LifeSupportGame.ts`
7. `render/StationRenderer.ts`
8. `render/DiegeticHUD.ts`
