# Training — дневник тренировок с тренером-Claude

Self-hosted веб-сервис (mobile-first): дневник подходов, авто-прогрессия, редактируемая программа, графики, многопользовательский режим. ИИ-тренер — не API внутри сервиса, а Claude Code, который ходит в coach-API (см. `.claude/skills/coach/SKILL.md` и `scripts/coach.sh`).

## Стек
- `server/` — Node 22+ (в Docker — 24), Express 5, `node:sqlite` (без нативных зависимостей). БД — `data/training.db` (WAL), бэкапы в `data/backups/`.
- `web/` — Vite + React 18, без TypeScript. Сборка в `dist/web`, сервер раздаёт статику сам.
- `shared/` — правила прогрессии, валидатор программы, дефолтная программа. Импортируются и сервером, и фронтом (`@shared/*`).
- `tests/` — `node --test`; правила прогрессии покрыты обязательно.

## Команды
- `npm install && npm run dev` — сервер :8080 + vite :5173 (proxy /api)
- `npm test`, `npm run build`, `npm start`
- Деплой: `docker compose up -d --build` (или `scripts/install.sh` для друзей — тянет образ из ghcr.io)
- Релиз: поднять `version` в package.json, дописать CHANGELOG.md, `git tag vX.Y.Z && git push --tags` → Actions собирает образ и создаёт GitHub Release; клиенты видят баннер «доступна версия».

## Соглашения
- Все данные — per user (`user_id`), сессии в БД, пароли scrypt. Первый зарегистрированный — админ.
- Тренер работает с Bearer `COACH_TOKEN` + заголовок `X-User-Id`.
- Вес в подходах суммарный, кроме `per_hand`. `pain` (0–10) — обязателен при сохранении тренировки.
- Программу менять только новой версией (`PUT /api/program`), не правкой старой.
