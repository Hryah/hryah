import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RETRO_LEVELS } from "../../render/style";
import { load, save } from "../../storage";
import { t } from "../text";
import "./retro.css";

// Ретро-стиль на всю гру. WebGL-сцени беруть шейдери з render/style.ts, а canvas і SVG інших частин
// (політ, каюта, орбіта, превʼю апарата) — SVG-фільтр #hryah-retro з тим самим виглядом.
// Текст інтерфейсу фільтр не чіпає, щоб лишався читабельним. Вибір зберігається (src/storage.ts).

const KEY = "retroStyle";
const RetroContext = createContext<{ on: boolean; toggle: () => void }>({ on: true, toggle: () => {} });

export const useRetro = () => useContext(RetroContext);

// Розмір «пікселя» SVG-фільтра в CSS-пікселях: на екранах із DPR 2 це відповідає 4 пікселям буфера WebGL.
const CELL = 2;
// Сходинки відтінків: discrete-таблиця з RETRO_LEVELS + 1 значень, як floor(x·n + 0,5) / n у шейдері.
const TABLE = Array.from({ length: RETRO_LEVELS + 1 }, (_, i) => (i / RETRO_LEVELS).toFixed(3)).join(" ");

export function RetroProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => load<boolean>(KEY) ?? true);
  useEffect(() => {
    document.documentElement.classList.toggle("retro", on);
    save(KEY, on);
  }, [on]);
  return (
    <RetroContext.Provider value={{ on, toggle: () => setOn((v) => !v) }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <filter id="hryah-retro" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* Піксельна сітка: беремо одну точку з кожної клітинки й розтягуємо її на всю клітинку. */}
          <feFlood x={CELL / 2} y={CELL / 2} width="1" height="1" floodColor="#000" />
          <feComposite width={CELL} height={CELL} />
          <feTile result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" />
          <feMorphology operator="dilate" radius={CELL / 2} result="pixels" />
          {/* Обмежені відтінки на канал. */}
          <feComponentTransfer in="pixels">
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
