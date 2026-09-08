#!/usr/bin/env bash
# Обновление до последнего релиза: тянет свежий образ и перезапускает контейнер. Данные в ./data не трогаются.
set -euo pipefail
cd "$(dirname "$0")"
[ -f compose.yml ] || cd .. # если скрипт лежит в scripts/ внутри репо
echo "Бэкап базы перед обновлением…"
docker compose exec -T training node -e "import('/app/server/backup.js').then(m=>console.log(m.runBackup()))" 2>/dev/null || echo "(контейнер не запущен — бэкап пропущен)"
PROFILES=""; grep -qE "^TUNNEL_TOKEN=.+" .env 2>/dev/null && PROFILES="--profile tunnel"
if [ -d .git ]; then
  git pull --ff-only
  docker compose $PROFILES up -d --build
else
  docker compose $PROFILES pull
  docker compose $PROFILES up -d
fi
docker image prune -f >/dev/null 2>&1 || true
sleep 2
curl -fsS "http://127.0.0.1:$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | sed 's/^$/8080/')/api/health" && echo
echo "Обновлено."
