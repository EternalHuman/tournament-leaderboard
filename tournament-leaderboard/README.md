# Tournament Leaderboard (GitHub Pages)

Готовая статическая страница с тремя вкладками:
1. **Общая информация** — очки за места/киллы/ревайвы/ассисты, количество матчей, карты, правила.
2. **Команды** — сортируемая таблица, очки/киллы/среднее место/матчи, плюс мини‑блок «очки по матчам».
3. **Игроки** — сортируемая таблица с **ADR** по умолчанию и сопутствующей статистикой.

## Деплой на GitHub Pages

1. Создайте репозиторий и загрузите содержимое этого архива в корень.
2. В настройках репозитория включите **Pages** → Deploy from a branch → ветка `main` → `/(root)`.
3. Откройте опубликованный URL — страница готова.

> Данные лежат в `/data/*.json`. Их можно перезаписывать вашим парсером. Страница подтягивает данные через `fetch` и кэш‑бастер `?v=meta.version` из `data/meta.json`.

### Структура
```
/
├── index.html
├── assets/
│   ├── styles.css
│   └── app.js
└── data/
    ├── meta.json
    ├── tournament.json
    ├── teams.json
    └── players.json
```

### Форматы JSON

- `data/meta.json`:
```json
{"generatedAt":"2025-10-21T18:42:00Z","version":"20251021184200"}
```

- `data/tournament.json`:
```json
{
  "title": "Autumn Cup 2025",
  "description": "Описание турнира...",
  "scoring": {
    "placements": [{"place":1,"points":10}, {"place":2,"points":6}],
    "killPoints": 1,
    "revivePoints": 0.5,
    "assistPoints": 0.25
  },
  "matches": { "total": 6, "maps": ["Breeze","Ascent","Haven","Split","Lotus","Bind"] },
  "rules": ["Правило 1", "Правило 2"]
}
```

- `data/teams.json`:
```json
[
  {"team":"Alpha","place":1,"points":18,"kills":53,"matches":6,"placeAvg":2.8,"perMatchPoints":[6,2,4,0,4,2]}
]
```

- `data/players.json`:
```json
[
  {"player":"fragmaster","team":"Alpha","adr":142.3,"kills":20,"assists":7,"revives":3,"matches":6}
]
```

## Кастомизация
- Цвета/стили — в `assets/styles.css`.
- Колонки/сортировка — в `assets/app.js` (массивы `teamCols` и `playerCols`).
- Вкладки управляются через хэш URL (`#overview`, `#teams`, `#players`).

Удачного турнира!