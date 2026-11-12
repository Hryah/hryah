// main (/) і experimental (/experimental/) живуть на одній адресі, тож ділять localStorage.
// Усі ключі мають префікс каналу, щоб експериментальна схема стану не псувала збереження з main.
const prefix = import.meta.env.BASE_URL;

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
  } catch {
    /* приватний режим або переповнено — гра має працювати й без збережень */
  }
}

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${prefix}${key}`);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}
