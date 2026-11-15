// Візуальний стиль гри: та сама пара фільтрів, що в галереї (піксельна сітка + обмежені відтінки).
// WebGL-сцени (2.5D-стенд, сцени рушія) отримують їх шейдерами; canvas і SVG інших частин —
// еквівалентним SVG-фільтром (src/ui/style/RetroStyle.tsx). Перемикач — у шапці гри.
import { pixelate, posterize, type Filter } from './filters';

export const RETRO_CELL_CSS = 3;   // розмір «пікселя» в CSS-пікселях, однаковий для WebGL і SVG-фільтра
export const RETRO_LEVELS = 8;     // відтінків на канал

// Буфер WebGL рушія має щільність min(DPR, 2) (stage.ts), тож піксель у буфері множимо на неї.
export function gameFilters(): readonly Filter[] {
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  return [pixelate(Math.round(RETRO_CELL_CSS * ratio)), posterize(RETRO_LEVELS)];
}
