// Візуальний стиль гри: та сама пара фільтрів, що в галереї (піксельна сітка + обмежені відтінки).
// WebGL-сцени (2.5D-стенд, сцени рушія) отримують їх шейдерами; canvas і SVG інших частин —
// еквівалентним SVG-фільтром (src/ui/style/RetroStyle.tsx). Перемикач — у шапці гри.
import { pixelate, posterize, type Filter } from './filters';

export const RETRO_PIXEL_PX = 4;   // розмір «пікселя» в пікселях буфера WebGL
export const RETRO_LEVELS = 8;     // відтінків на канал

export const GAME_FILTERS: readonly Filter[] = [pixelate(RETRO_PIXEL_PX), posterize(RETRO_LEVELS)];
