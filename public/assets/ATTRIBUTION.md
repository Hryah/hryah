# Open-Source SVG Assets Attribution

Усі перелічені нижче `.svg` файли завантажені з відкритих джерел із вільними ліцензіями та приведені до єдиного формату (`viewBox`, явні `width`/`height`, прозорий фон і видима палітра для темного інтерфейсу).

## 1. Планети та мапи (`public/assets/bodies/`)
- `earth-map.svg` — [Simple_world_map.svg](https://commons.wikimedia.org/wiki/File:Simple_world_map.svg) (автор Tom-b, Wikimedia Commons). Ліцензія: **CC0 1.0 Universal (Public Domain)**. Додано `viewBox="0 0 494.7 265.7"`.
- `earth-globe.svg` — `emoji_u1f30d.svg` з [Google Noto Emoji](https://github.com/googlefonts/noto-emoji/tree/v2.034). Ліцензія: **Apache License 2.0**. Додано `width="128" height="128"`.
- `moon.svg` — `emoji_u1f315.svg` з [Google Noto Emoji](https://github.com/googlefonts/noto-emoji/tree/v2.034). Ліцензія: **Apache License 2.0**. Додано `width="128" height="128"`.

## 2. Іконки інтерфейсу UI (`public/assets/icons/ui/` — 27 файлів)
Джерело: [Lucide Icons](https://lucide.dev/) / `lucide-static` v1.73.0 (`battery-charging.svg`, `camera.svg`, `circle-check.svg`, `circle-x.svg`, `clock.svg`, `cloud.svg`, `coins.svg`, `cpu.svg`, `eye.svg`, `flame.svg`, `fuel.svg`, `globe.svg`, `lock-open.svg`, `lock.svg`, `orbit.svg`, `radio.svg`, `rocket.svg`, `satellite-dish.svg`, `shield.svg`, `siren.svg`, `thermometer.svg`, `triangle-alert.svg`, `trophy.svg`, `weight.svg`, `wind.svg`, `wrench.svg`, `zap.svg`).
Ліцензія: **ISC License** (legacy Feather-derived icons: **MIT License**). Колір контуру змінено з `currentColor` на `#e8eaf3` для видимого рендерингу через `<img>` і Canvas на темному фоні.

## 3. Емблеми вигаданих агенцій (`public/assets/icons/agencies/` — 4 файли)
Джерело: [Game-Icons.net](https://game-icons.net/) ([github.com/game-icons/icons](https://github.com/game-icons/icons)). Ліцензія: **CC BY 3.0**.
Модифікація: видалено суцільний чорний фон `<path d="M0 0h512v512H0z"/>`, додано `width="512" height="512"`, заливку змінено на `#e8eaf3`.
- `borealis.svg` — `polar-star` by **Delapouite**
- `monsoon.svg` — `entangled-typhoon` by **Lorc**
- `meridia.svg` — `orb-direction` by **Lorc**
- `kestrel.svg` — `hawk-emblem` by **Lorc**

## 4. Додаткові технічні іконки станції (`public/assets/icons/station/` — 4 файли)
Джерело: [Game-Icons.net](https://game-icons.net/) ([github.com/game-icons/icons](https://github.com/game-icons/icons)). Ліцензія: **CC BY 3.0**.
Модифікація: видалено суцільний чорний фон `<path d="M0 0h512v512H0z"/>`, додано `width="512" height="512"`, змінено колір заливки під палітру станції.
- `filter-barrel.svg` — `chemical-tank` by **Lorc** (`#38bdf8`)
- `oxygen-tanks.svg` — `scuba-tanks` by **Delapouite** (`#7dd3fc`)
- `energy-tank.svg` — `energy-tank` by **Delapouite** (`#3ddc84`)
- `radar-dish.svg` — `radar-dish` by **Lorc** (`#cbd5e1`)

## 5. Векторні темплейти гри (`public/assets/templates/` — 41 файл SVG)
- **Команда проєкту (original designer SVGs & normalised 2D cel-shaded vectors):**
  - `design/eng-{cold,chem,ion}.svg`, `design/sol-{s,m,l}.svg`, `design/bat-{s,m,l}.svg`, `design/ant-{s,m,l}.svg`, `design/cam-{s,m,l}.svg`, `design/bus-standard.svg`
  - `flight/astro-{idle,pull,fly,stun}.svg`, `flight/mod-{horizontal,hub,vertical}.svg`, `flight/{console-terminal,door-seal,handle-rail,obstacle-pillar,obstacle-cargo}.svg`
  - `orbit/target-poi.svg`
  - `extras/{astro-front,astro-back,astro-left,astro-right,rocket-sketch-base,rocket-sketch-mid,rocket-sketch-top,hub-sketch}.svg`
- **Похідні відкритих векторних матеріалів (recolored / adapted to team palette):**
  - `design/launcher-small.svg` — адаптовано з [File:Vega.svg](https://commons.wikimedia.org/wiki/File:Vega.svg) (Wikimedia Commons).
  - `design/launcher-medium.svg`, `design/launcher-heavy.svg` — адаптовано з [File:Falcon_9_&_Heavy.svg](https://commons.wikimedia.org/wiki/File:Falcon_9_%26_Heavy.svg) (Wikimedia Commons).
  - `orbit/ground-station.svg` — адаптовано з `satellite_antenna` у [Microsoft FluentUI Emoji](https://github.com/microsoft/fluentui-emoji). Ліцензія: **MIT License**.
