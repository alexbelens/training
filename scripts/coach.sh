#!/usr/bin/env bash
# Тренерский CLI для Claude Code. Ходит в API с COACH_TOKEN.
# Использование (локально на хосте или через ssh: COACH_SSH=budget ./scripts/coach.sh ...):
#   coach.sh users                      — пользователи, открытые запросы, последняя тренировка
#   coach.sh export <user_id>           — полный JSON пользователя (профиль, программа, тренировки, веса, отчёты)
#   coach.sh suggest <user_id> <A|B|C>  — рекомендации по правилам прогрессии
#   coach.sh report <user_id> <file>    — записать разбор (JSON: summary, good[], concerns[], next{A:[],B:[]}, one_recommendation, ask_user, see_doctor, request_id)
#   coach.sh program <user_id> <file>   — сохранить новую версию программы (JSON: schema, days, rationale)
#   coach.sh close <user_id> <req_id>   — закрыть запрос без отчёта
set -euo pipefail
ENV_FILE="${COACH_ENV:-$(dirname "$0")/../.env}"
if [ -n "${COACH_SSH:-}" ]; then
  # выполняем эту же команду на удалённом хосте
  exec ssh "$COACH_SSH" "cd ${COACH_REMOTE_DIR:-/root/training} && ./coach.sh $*"
fi
[ -f "$ENV_FILE" ] || ENV_FILE=./.env
TOKEN="${COACH_TOKEN:-$(grep -E '^COACH_TOKEN=' "$ENV_FILE" | cut -d= -f2-)}"
PORT="${PORT:-$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2-)}"
BASE="${COACH_BASE:-http://127.0.0.1:${PORT:-8080}}"
[ -n "$TOKEN" ] || { echo "COACH_TOKEN не найден в $ENV_FILE"; exit 1; }
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

cmd="${1:-}"; shift || true
case "$cmd" in
  users)   curl -fsS "${H[@]}" "$BASE/api/admin/overview" ;;
  export)  curl -fsS "${H[@]}" -H "X-User-Id: $1" "$BASE/api/export" ;;
  suggest) curl -fsS "${H[@]}" -H "X-User-Id: $1" "$BASE/api/suggest/$2" ;;
  report)  curl -fsS "${H[@]}" -H "X-User-Id: $1" -d @"$2" "$BASE/api/coach/reports" ;;
  program) curl -fsS "${H[@]}" -H "X-User-Id: $1" -X PUT -d @"$2" "$BASE/api/program" ;;
  close)   curl -fsS "${H[@]}" -H "X-User-Id: $1" -X POST "$BASE/api/coach/requests/$2/close" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
echo
