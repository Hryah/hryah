# Як ми працюємо

```
feature/<хто>-<що>  ──PR──►  experimental  ──PR──►  main
   (твоя гілка)          (інтеграція, баги злиття)   (стабільна, для суддів)
```

| Гілка | Для чого | Хто зливає | Де живе |
|---|---|---|---|
| `feature/*` | твоя робота, пушити можна що завгодно | — | ніде (CI мовчить) |
| `experimental` | збираємо разом, виправляємо конфлікти | автор свого PR, коли check зелений | `/experimental/` |
| `main` | стабільна збірка | тімлід, після огляду живої адреси `/experimental/` | `/` |

## Щоденний цикл

1. `git switch experimental && git pull && git switch -c feature/ivan-fuel-tank`
2. Працюєш, комітиш, пушиш. Нічого не збирається, поки немає PR.
3. Хочеш перевірку раніше: відкрий **draft PR** у `experimental`. `check & build` піде, AI-рев'ю мовчить.
4. Готово: зніми draft. Прийде AI-рев'ю (коментар у PR і повідомлення тімліду в Telegram).
5. Зелений `check & build` → **Squash and merge** у `experimental`.
6. Подивись свою зміну на `/experimental/`. Зламав інших: роби `revert`, не лишай червоне.
7. Коли `experimental` стабільна, тімлід відкриває PR `experimental → main` і зливає **Create a merge commit** (не squash, інакше гілки розійдуться).

## Правила

- Прямий пуш у `experimental` і `main` заборонений. Тільки PR.
- PR малі й часті. AI-рев'ю обрізає diff після 60 тис. символів.
- AI-рев'ю порадче. 🔴 BLOCKER варто прочитати, але остаточно вирішує людина.
- Ядро `src/core/` чисте: без React/DOM, без `Math.random()` і `Date.now()`, стан лише JSON. Інакше `check` червоний.
- Ключі `localStorage` лише через `src/storage.ts`: `main` і `experimental` на одній адресі.
- Секрети в код не комітимо.

## Що де дивитись

- Екран на малинці й `http://<pi>:8087/` (лише з tailnet): стан каналів, PR, останні запуски.
- Відкат на малинці: `hryah-activate main --rollback` (те саме для `experimental`).
