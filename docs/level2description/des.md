Головна причина, чому поточний білд виглядає сиро — **камера прив'язана до гравця замість модуля** (через що пів екрана займає порожній космос, коли стоїш біля лівої стіни), **простий прямокутник замість восьмикутника зі скетчу**, а термінал намальований як помаранчеве коло просто поверх ручки.

Нижче — виправлена архітектура з **кімнатною камерою (як у *Celeste* / *Metroid* / *Among Us*)**, **FNAF-мінікартою**, **восьмикутною геометрією** та **декларативним конфігом рівня**, де кожен гвинтик задається в одному файлі.

---

## 1. Архітектура кімнатної камери (`RoomCameraController`)

Камера **НЕ слідує за гравцем**. Камера завжди відцентрована рівно по центру активного модуля (`currentModule.center`) і масштабується так, щоб поточний модуль займав **80–85% екрана**.

### Як працює безшовний перехід між модулями:

1. Коли космонавт перебуває в `MODULE_1`, камера жорстко дивиться на центр `MODULE_1` `(cx1, cy1)` із зумом `scale1` (модуль стоїть рівно посеред екрана, ніяких порожніх пів екрана зліва).
2. На стику між `MODULE_1` та `MODULE_2` є невидимий тригер шлюзу `DoorTransitionZone`.
3. Як тільки центр космонавта перетинає лінію шлюзу і влітає в `MODULE_2`:
* `activeModuleId` змінюється на `'MODULE_2'`.
* Камера за `0.45 секунди` через плавну криву (`easeInOutCubic`) переїжджає з центру `(cx1, cy1, scale1)` у центр `(cx2, cy2, scale2)`.
* При цьому **фізичний вектор швидкості космонавта ($\vec{V}$) зберігається** — ти влітаєш у двері на повній швидкості, екран плавно переміщується на нову кімнату, а ти вже летиш всередині нового модуля до його ручок.
* Сусідні модулі рендеряться напівпрозорими або затемненими (`opacity: 0.25` за маскою `FogOfWar`), щоб гравець концентрувався тільки на поточній кімнаті.



```typescript
interface CameraState {
  currentX: number;
  currentY: number;
  currentZoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

function updateRoomCamera(cam: CameraState, activeModule: ModuleConfig, viewportW: number, viewportH: number, dt: number) {
  // Центр поточного модуля у світових координатах
  cam.targetX = activeModule.worldPos.x + activeModule.size.width / 2;
  cam.targetY = activeModule.worldPos.y + activeModule.size.height / 2;

  // Авто-зум, щоб поточний модуль ідеально вписувався в екран з відступами 12%
  const zoomX = (viewportW * 0.82) / activeModule.size.width;
  const zoomY = (viewportH * 0.78) / activeModule.size.height;
  cam.targetZoom = Math.min(zoomX, zoomY);

  // Плавний глайд при переході через шлюз
  const speed = 7.5;
  cam.currentX += (cam.targetX - cam.currentX) * Math.min(1, speed * dt);
  cam.currentY += (cam.targetY - cam.currentY) * Math.min(1, speed * dt);
  cam.currentZoom += (cam.targetZoom - cam.currentZoom) * Math.min(1, speed * dt);
}

```

---

## 2. Радар / Міні-карта станції (`StationMinimapHUD`)

Оскільки камера тепер прив'язана до поточного модуля, гравець **не бачить сусідні кімнати безпосередньо**. Саме тут з'являється справжній FNAF-геймплей: у правому верхньому (або нижньому) куті висить **Тактичний Радар Станції**.

### Що відображає міні-карта (220x160 px):

1. **Схема всіх відкритих модулів** (контури кімнат, з'єднані шлюзами). Поточний модуль, де зараз гравець, підсвічений яскравим білим/блакитним контуром.
2. **Непристиковані модулі (Майбутні розширення):** малюються пунктирними лініями (`dashed`) зі статусом `LOCKED — DOCKING #1..3`. Коли модуль пристиковується в ході гри — його контур на мінікарті стає суцільним і загоряється.
3. **Точка космонавта:** зелений маркер у реальному часі.
4. **Індикатори аварій (FNAF-тривоги):** якщо ти сидиш у `MODULE_4` (внизу), а в `MODULE_1` (зліва) зламалася сонячна панель — на мінікарті кімната `MODULE_1` починає **пульсувати червоним/помаранчевим** з іконкою блискавки та таймером зворотного відліку (`24s`).

---

## 3. Декларативна архітектура конфігурації рівня (`LevelBlueprint.ts`)

Замість того щоб хардкодити координати у фізиці чи рендері, весь рівень описується **одним строго типізованим конфігом**. Ти можеш міняти форму кімнати, фаски кутів (щоб були восьмикутники зі скетчу, а не тупі коробки), позиції ручок, дизайн комп'ютерів і перешкод в одному JSON/TS-об'єкті.

### Повна схема конфігурації модуля, ручок і комп'ютерів:

```typescript
export type ChamferShape = {
  topLeft: number;     // Зріз кута в пікселях (робить восьмикутник зі скетчу!)
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export interface HandleBlueprint {
  id: string;
  // Локальні координати відносно лівого верхнього кута модуля (або у %: 0.0 - 1.0)
  start: { x: number; y: number };
  end: { x: number; y: number };
  grabRadius: number;
  visualStyle: 'WALL_RAIL' | 'CORNER_45' | 'CENTER_RING';
  colorTheme?: string;
}

export interface ComputerBlueprint {
  id: string;
  type: 'SOLAR' | 'OXYGEN' | 'THERMAL' | 'DOCKING';
  linkedHandleId: string;           // До якої ручки треба причепитися, щоб увімкнути
  mountPosition: { x: number; y: number }; // Де фізично стоїть корпус комп'ютера на стіні
  mountAngle: number;               // Поворот корпусу (0 = на підлозі, 180 = на стелі, 90 = на стіні)
  visualPreset: {
    chassisWidth: number;
    chassisHeight: number;
    screenColor: string;
    hasAntenna?: boolean;
    hasCoolingPipes?: boolean;      // Візуальні труби для O2/Thermal комп'ютера
    hasRadarDish?: boolean;         // Візуальний радар для Docking комп'ютера
  };
}

export interface ObstacleBlueprint {
  id: string;
  kind: 'PILLAR_CIRCLE' | 'CARGO_BOX' | 'AIR_LEAK_JET';
  pos: { x: number; y: number };
  radiusOrSize: { w: number; h: number };
  bounciness: number;               // Наскільки сильно відбиває космонавта
}

export interface DoorwayBlueprint {
  id: string;
  side: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  offset: number;                   // Зміщення вздовж стіни
  width: number;                    // Ширина проходу шлюзу (напр. 110px)
  connectsToModuleId: string;
  unlockedAtDockingWave: 0 | 1 | 2 | 3; // 0 = відкрито зі старту, 1..3 = відкривається після стикування
}

export interface ModuleBlueprint {
  id: string;
  title: string;                    // Напр. "СЕКТОР А: ЖИТЛОВИЙ БЛОК"
  orientation: 'HORIZONTAL' | 'VERTICAL' | 'INTERSECTION';
  unlockedAtWave: 0 | 1 | 2 | 3;    // Коли модуль з'являється на карті
  worldPos: { x: number; y: number };
  size: { width: number; height: number };
  chamfer: ChamferShape;            // Зрізані кути як на твоєму паперовому ескізі!
  theme: {
    floorColor: string;
    wallThickness: number;
    gridPattern: 'HEX' | 'PANELS' | 'TECH_RIBS';
    portholes: Array<{ x: number; y: number; r: number }>; // Ілюмінатори
  };
  doors: DoorwayBlueprint[];
  handles: HandleBlueprint[];
  computers: ComputerBlueprint[];
  obstacles: ObstacleBlueprint[];
}

```

---

## 4. Як мають виглядати об'єкти (Виправлення візуального геймдизайну)

Зараз на скріншоті:

* **Зелена капсула навколо космонавта** виглядає як гігантський огірок. Замість суцільної зеленої заливки радіус захвату ручки має малюватися лише як **тонкий пунктирний технічний контур (`1px dashed rgba(56, 189, 248, 0.35)`)**, і тільки тоді, коли космонавт летить поруч.


* **Комп'ютер (`SOLAR 40s`)** зараз просто висить круглим жовтим бубликом поверх червоної палки. **Як має бути:**


1. Комп'ютер — це **деталізована стійка/консоль, вмонтована в стіну модуля** (монітор, клавіатура, світлодіоди стану, кабелі по стіні).
2. Поруч із консоллю розташована спеціальна **синя/бірюзова ручка-фіксатор** для ніг/рук космонавта.
3. Коли на комп'ютері починається тривога — блимає **сам монітор консолі**, від нього йде м'яке світлове гало (`radialGradient`), а над ним висить акуратний голографічний бейдж `[⚡ СОНЯЧНІ ПАНЕЛІ: 38с]`.


* **Геометрія кімнат за твоїм скетчем:**
* Використовуй параметр `chamfer: { topLeft: 90, topRight: 90, bottomRight: 90, bottomLeft: 90 }` — це автоматично перетворює нудний прямокутник на **восьмикутний космічний модуль зі скошеними кутами**, де на скосах стоять діагональні ручки для швидких рикошетів.





---

## 5. Готовий приклад конфігурації (`stationLevelConfig.ts`), який легко редагувати

Ось як прописуються перші модулі у твоєму коді з цією архітектурою — змінюєш одну цифру і ручка або комп'ютер стають куди треба:

```typescript
export const STATION_LEVEL_CONFIG: ModuleBlueprint[] = [
  {
    id: 'MOD_HABITAT',
    title: 'ВІДСІК 01 // ЕНЕРГОБЛОК (HORIZONTAL)',
    orientation: 'HORIZONTAL',
    unlockedAtWave: 0,
    worldPos: { x: 0, y: 0 },
    size: { width: 920, height: 480 },
    chamfer: { topLeft: 70, topRight: 70, bottomRight: 70, bottomLeft: 70 }, // Скошені кути зі скетчу!
    theme: {
      floorColor: '#111827',
      wallThickness: 14,
      gridPattern: 'TECH_RIBS',
      portholes: [
        { x: 280, y: 160, r: 48 },
        { x: 640, y: 160, r: 48 }
      ]
    },
    doors: [
      {
        id: 'DOOR_TO_HUB',
        side: 'RIGHT',
        offset: 240,        // Посередині правої стіни
        width: 120,         // Справжні двері-шлюз, а не дірка на всю стіну!
        connectsToModuleId: 'MOD_INTERSECTION',
        unlockedAtDockingWave: 0
      }
    ],
    obstacles: [
      // Центральні круглі колони зі скетчу, які заважають летіти по прямій
      { id: 'OBS_1', kind: 'PILLAR_CIRCLE', pos: { x: 280, y: 240 }, radiusOrSize: { w: 52, h: 52 }, bounciness: 0.7 },
      { id: 'OBS_2', kind: 'PILLAR_CIRCLE', pos: { x: 640, y: 240 }, radiusOrSize: { w: 52, h: 52 }, bounciness: 0.7 }
    ],
    handles: [
      { id: 'H_START', start: { x: 45, y: 180 }, end: { x: 45, y: 300 }, grabRadius: 34, visualStyle: 'WALL_RAIL' },
      { id: 'H_TOP_1', start: { x: 180, y: 35 }, end: { x: 420, y: 35 }, grabRadius: 34, visualStyle: 'WALL_RAIL' },
      { id: 'H_TOP_2', start: { x: 520, y: 35 }, end: { x: 760, y: 35 }, grabRadius: 34, visualStyle: 'WALL_RAIL' },
      { id: 'H_BOT_1', start: { x: 160, y: 445 }, end: { x: 360, y: 445 }, grabRadius: 34, visualStyle: 'WALL_RAIL' },
      // Спеціальна ручка біля комп'ютера сонячних панелей
      { id: 'H_SOLAR_TERM', start: { x: 480, y: 445 }, end: { x: 620, y: 445 }, grabRadius: 38, visualStyle: 'WALL_RAIL', colorTheme: '#38bdf8' }
    ],
    computers: [
      {
        id: 'COMP_SOLAR',
        type: 'SOLAR',
        linkedHandleId: 'H_SOLAR_TERM',
        mountPosition: { x: 550, y: 415 }, // Стоїть на нижній стіні НАД ручкою
        mountAngle: 0,
        visualPreset: {
          chassisWidth: 96,
          chassisHeight: 54,
          screenColor: '#0284c7',
          hasAntenna: true
        }
      }
    ]
  },

  {
    id: 'MOD_INTERSECTION',
    title: 'ВУЗОЛ 02 // ЦЕНТРАЛЬНИЙ ХАБ (INTERSECTION)',
    orientation: 'INTERSECTION',
    unlockedAtWave: 0,
    worldPos: { x: 920, y: -110 },
    size: { width: 700, height: 700 },
    chamfer: { topLeft: 160, topRight: 160, bottomRight: 160, bottomLeft: 160 }, // Великі скоси під 45 градусів!
    theme: {
      floorColor: '#0f172a',
      wallThickness: 14,
      gridPattern: 'HEX',
      portholes: [{ x: 350, y: 350, r: 75 }]
    },
    doors: [
      { id: 'DOOR_FROM_HAB', side: 'LEFT', offset: 350, width: 120, connectsToModuleId: 'MOD_HABITAT', unlockedAtDockingWave: 0 },
      { id: 'DOOR_NORTH_DOCK', side: 'TOP', offset: 350, width: 120, connectsToModuleId: 'MOD_VERTICAL_LAB', unlockedAtDockingWave: 1 },
      { id: 'DOOR_EAST_DOCK', side: 'RIGHT', offset: 350, width: 120, connectsToModuleId: 'MOD_THERMAL_BAY', unlockedAtDockingWave: 2 },
      { id: 'DOOR_SOUTH_DOCK', side: 'BOTTOM', offset: 350, width: 120, connectsToModuleId: 'MOD_COMMAND', unlockedAtDockingWave: 3 }
    ],
    obstacles: [],
    handles: [
      // Діагональні кутові ручки зі скетчу Intersection для швидкісного рикошету!
      { id: 'H_CORNER_TL', start: { x: 55, y: 175 }, end: { x: 175, y: 55 }, grabRadius: 36, visualStyle: 'CORNER_45' },
      { id: 'H_CORNER_TR', start: { x: 525, y: 55 }, end: { x: 645, y: 175 }, grabRadius: 36, visualStyle: 'CORNER_45' },
      { id: 'H_CORNER_BL', start: { x: 55, y: 525 }, end: { x: 175, y: 645 }, grabRadius: 36, visualStyle: 'CORNER_45' },
      { id: 'H_DOCK_CONSOLE', start: { x: 525, y: 645 }, end: { x: 645, y: 525 }, grabRadius: 38, visualStyle: 'CORNER_45', colorTheme: '#f59e0b' }
    ],
    computers: [
      {
        id: 'COMP_DOCKING_MAIN',
        type: 'DOCKING',
        linkedHandleId: 'H_DOCK_CONSOLE',
        mountPosition: { x: 560, y: 560 },
        mountAngle: -45,
        visualPreset: {
          chassisWidth: 110,
          chassisHeight: 60,
          screenColor: '#f59e0b',
          hasRadarDish: true
        }
      }
    ]
  }
];

```

---

## 6. Чек-ліст змін для інтеграції в поточний код:

1. **Замінити `Camera2D` на кімнатний режим (`RoomCameraController`):** визначати `activeModule` за координатами космонавта (`pointInModuleBounds(player.pos, module)`) і центрувати камеру на `activeModule`, плавно переїжджаючи тільки в момент перетину шлюзу (`DoorwayBlueprint`).
2. **Генератор восьмикутних стін (`buildOctagonWallsFromChamfer`):** замість 4 ліній прямокутника генерувати 8 відрізків стін з урахуванням `chamfer` і автоматично вирізати в них отвори під `doors` (якщо `unlockedAtDockingWave <= completedDockings`, інакше малювати закриті броньовані стулки шлюзу).
3. **Додати компонент `StationMinimap` у правий верхній кут:** рендерить зменшений граф `STATION_LEVEL_CONFIG` (масштаб `1:18`), підсвічує активну кімнату, малює точку гравця та пульсуючі червоні іконки аварій у сусідніх модулях.
4. **Відокремити рендер `ComputerBlueprint` від `HandleBlueprint`:** малювати термінал як приборну стійку з екраном на стіні, а не як кружок поверх червоної лінії поручня. Прибрати суцільний зелений овал навколо космонавта, залишивши лише тонке технологічне кільце прицілу та вектор рогатки.


---

## 8. Кімнатна камера (`RoomCameraController`), Міні-карта (`StationMinimapHUD`) та Декларативний конфіг (`stationLevelConfig.ts`)

1. **Кімнатна камера (`RoomCameraController`)**:
   - Камера НЕ слідує за гравцем всередині кімнати — вона відцентрована по центру поточного модуля (`activeModule`) і масштабується так, щоб поточний модуль займав 80–85% екрана (`zoomX = (viewportW * 0.82) / width`, `zoomY = (viewportH * 0.78) / height`).
   - При перетині шлюзу (`DoorwayBlueprint`) `activeModuleId` змінюється і камера плавно переїжджає в центр нового модуля зі збереженням вектора швидкості космонавта.
   - Сусідні модулі затемнені за маскою `FogOfWar` (`opacity: 0.25`).
2. **Тактичний Радар / Міні-карта (`StationMinimapHUD`, 220x160 px у правому верхньому куті)**:
   - Схема всіх відкритих модулів (поточний модуль підсвічений яскравим білим/блакитним контуром).
   - Непристиковані модулі малюються пунктирними лініями (`LOCKED — DOCKING #1..3`).
   - Зелений маркер космонавта у реальному часі.
   - Пульсуючі червоні/помаранчеві FNAF-тривоги з таймером у кімнатах, де горять комп'ютери.
3. **Декларативний конфіг (`STATION_LEVEL_CONFIG` / `ModuleBlueprint`)**:
   - `ChamferShape` перетворює модулі на восьмикутники зі скошеними кутами (`buildOctagonWallsFromChamfer`).
   - `DoorwayBlueprint` прорізає двері-шлюзи у стінах восьмикутника.
   - `ComputerBlueprint` візуально відокремлений від `HandleBlueprint` (стійка з монітором, клавіатурою, антеною/трубами/радаром на стіні поруч із поручнем-фіксатором).
   - Радіус захвату ручки малюється лише як тонкий пунктирний технічний контур `1px dashed rgba(56, 189, 248, 0.35)` поблизу гравця.
