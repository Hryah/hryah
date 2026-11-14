import type { CauseEntry, DesignInput } from "../../core/contracts";
import { fmt, t } from "../text";

// Текст запису журналу причин. Параметри-ідентифікатори (слот, модуль, носій, запас) перекладаємо в назви,
// а числа округлюємо, щоб гравець бачив «12 kg», а не «12.000000001».
export function describeEntry(entry: CauseEntry, base: DesignInput): string {
  const params: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(entry.params ?? {})) {
    if (typeof value === "number") params[key] = fmt(value);
    else if (key === "slot") params[key] = t(`ui.slot.${value}`);
    else if (key === "margin") params[key] = t(`ui.margin.${value}`);
    else if (key === "module") {
      const module = base.catalog.modules.find((m) => m.id === value);
      // Власна розробка не входить у базовий каталог: її модулі мають id custom-<слот>-<агенція>.
      params[key] = module ? t(module.nameKey) : String(value).startsWith("custom-") ? t("custom.instrument") : value;
    } else if (key === "launcherId") {
      const launcher = base.mission.launchers.find((l) => l.id === value);
      params[key] = launcher ? t(launcher.nameKey) : value;
    } else params[key] = value;
  }
  return t(entry.messageKey, params);
}
