import en from './texts.en.json';
import ru from './texts.ru.json';

export type Locale = 'en' | 'ru';

const dictionaries: Record<Locale, Record<string, string>> = { en, ru };

export function translate(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const dict = dictionaries[locale] ?? dictionaries.en;
  const raw = dict[key] ?? dictionaries.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
