import texts from "../data/texts.en.json";

// Усі тексти беремо за ключем із src/data/texts.en.json. Відсутній ключ показуємо як є, щоб помилка впадала в очі.
const dictionary: Record<string, string> = texts;

export function t(key: string, params?: Record<string, number | string>): string {
  const template = dictionary[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (params && name in params ? String(params[name]) : whole));
}

export const fmt = (x: number, digits = 2): string => String(Math.round(x * 10 ** digits) / 10 ** digits);
