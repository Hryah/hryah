import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RETRO_CELL_CSS, RETRO_LEVELS } from "../../render/style";
import { load, save } from "../../storage";
import { t } from "../text";
import "./retro.css";

// Ретро-стиль. Пікселізацію й палітру (SVG-фільтр #hryah-retro) мають великі сцени: орбіта й каюта.
// Превʼю апарата (3D-стенд через render/style.ts і SVG-схема з підписами) — лише палітру (#hryah-retro-colors).
// Політ фільтра не має: палітра псувала його кольори. HTML-текст інтерфейсу фільтр не чіпає. Вибір зберігається (src/storage.ts).

const KEY = "retroStyle";
const RetroContext = createContext<{ on: boolean; toggle: () => void }>({ on: true, toggle: () => {} });

export const useRetro = () => useContext(RetroContext);

// Розмір «пікселя» SVG-фільтра в CSS-пікселях. Беремо центральну точку клітинки й розширюємо на радіус 1:
// feMorphology дає квадрат (2r + 1) = 3, тобто рівно клітинку без перекриття сусідів.
const CELL = RETRO_CELL_CSS;
const RADIUS = (CELL - 1) / 2;
// Сходинки відтінків: discrete-таблиця з RETRO_LEVELS + 1 значень, як floor(x·n + 0,5) / n у шейдері.
const TABLE = Array.from({ length: RETRO_LEVELS + 1 }, (_, i) => (i / RETRO_LEVELS).toFixed(3)).join(" ");

export function RetroProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => load<unknown>(KEY) !== false);
  useEffect(() => {
    document.documentElement.classList.toggle("retro", on);
    save(KEY, on);
    return () => document.documentElement.classList.remove("retro");
  }, [on]);
  return (
    <RetroContext.Provider value={{ on, toggle: () => setOn((v) => !v) }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <filter id="hryah-retro" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* Піксельна сітка: беремо одну точку з кожної клітинки й розтягуємо її на всю клітинку. */}
          {/* in2 задано явно: без нього Firefox і Safari відкидають примітив і сцена зникає. */}
          <feFlood x={RADIUS} y={RADIUS} width="1" height="1" floodColor="#000" result="dot" />
          <feComposite in="dot" in2="dot" operator="over" x="0" y="0" width={CELL} height={CELL} result="cell" />
          <feTile in="cell" result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" result="samples" />
          <feMorphology in="samples" operator="dilate" radius={RADIUS} result="pixels" />
          {/* Обмежені відтінки на канал. */}
          <feComponentTransfer in="pixels">
            <feFuncR type="discrete" tableValues={TABLE} />
            <feFuncG type="discrete" tableValues={TABLE} />
            <feFuncB type="discrete" tableValues={TABLE} />
          </feComponentTransfer>
        </filter>
        {/* Лише обмежена палітра без пікселізації: для поверхонь із дрібним текстом (HUD польоту, підписи превʼю). Дешевша щокадру. */}
        <filter id="hryah-retro-colors" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues={TABLE} />
            <feFuncG type="discrete" tableValues={TABLE} />
            <feFuncB type="discrete" tableValues={TABLE} />
          </feComponentTransfer>
        </filter>
      </svg>
      {children}
    </RetroContext.Provider>
  );
}

export function RetroToggle() {
  const { on, toggle } = useRetro();
  return (
    <button type="button" className="retro-toggle" aria-pressed={on} onClick={toggle}>
      {on ? "▦ " : "▢ "}{t(on ? "ui.retro.on" : "ui.retro.off")}
    </button>
  );
}
