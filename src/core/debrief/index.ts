// debrief — із журналу причин будує ланцюжки «відмова ← ... ← рішення гравця».

import type { CauseEntry } from '../contracts';

export interface CauseChain {
  failure: CauseEntry;
  causes: CauseEntry[]; // усі попередні записи, що привели до відмови, від найближчих до найдальших
}

export function causeChains(log: CauseEntry[]): CauseChain[] {
  const byId: Record<string, CauseEntry> = {};
  for (const entry of log) byId[entry.id] = entry;

  return log
    .filter((entry) => entry.kind === 'failure')
    .map((failure) => {
      const causes: CauseEntry[] = [];
      const seen: Record<string, true> = { [failure.id]: true };
      let frontier = failure.causedBy ?? [];
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier) {
          const cause = byId[id];
          if (!cause || seen[id]) continue; // невідомий id або цикл: пропускаємо
          seen[id] = true;
          causes.push(cause);
          next.push(...(cause.causedBy ?? []));
        }
        frontier = next;
      }
      return { failure, causes };
    });
}

// Посилання на записи, яких у журналі немає. У тестах має бути порожньо.
export function danglingCauses(log: CauseEntry[]): string[] {
  const ids: Record<string, true> = {};
  for (const entry of log) ids[entry.id] = true;
  return log.flatMap((entry) => (entry.causedBy ?? []).filter((id) => !ids[id]));
}
