// Звідки зібрано цей сайт: канал визначаємо за базовим шляхом (CI збирає experimental під /experimental/).
export type Channel = "main" | "experimental" | "local";

export function channelFromBase(base: string, dev: boolean): Channel {
  if (dev) return "local";
  return base.startsWith("/experimental") ? "experimental" : "main";
}

export const channel: Channel = channelFromBase(import.meta.env.BASE_URL, import.meta.env.DEV);

// CI передає повний sha у VITE_COMMIT.
export const commit: string = (import.meta.env.VITE_COMMIT ?? "").slice(0, 7) || "local";

export const channelStyle: Record<Channel, { label: string; color: string }> = {
  main: { label: "MAIN · стабільна", color: "#3ddc84" },
  experimental: { label: "EXPERIMENTAL · тест", color: "#ffa23d" },
  local: { label: "LOCAL · розробка", color: "#5ca8ff" },
};
