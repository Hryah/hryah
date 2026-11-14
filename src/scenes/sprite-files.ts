// Vite оновлює список при додаванні PNG. Маніфест окремо задає розміри відсутніх малюнків.
const files = import.meta.glob('/public/assets/sprites/**/*.png', { query: '?url', import: 'default' });
export const spriteFiles: readonly string[] = Object.keys(files).map((path) => path.slice('/public/assets/sprites/'.length));
