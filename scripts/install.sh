#!/usr/bin/env bash
# Установка Training одной командой:
#   curl -fsSL https://raw.githubusercontent.com/alexbelens/training/main/scripts/install.sh | bash
# Требуется Docker с плагином compose. Создаёт папку ./training, скачивает compose.yml и .env, запускает.
set -euo pipefail
REPO="${TRAINING_REPO:-alexbelens/training}"
DIR="${TRAINING_DIR:-training}"
RAW="https://raw.githubusercontent.com/$REPO/main"

command -v docker >/dev/null || { echo "Нужен Docker: https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нужен плагин docker compose"; exit 1; }

mkdir -p "$DIR" && cd "$DIR"
curl -fsSL "$RAW/compose.yml" -o compose.yml
curl -fsSL "$RAW/scripts/update.sh" -o update.sh && chmod +x update.sh
if [ ! -f .env ]; then
  curl -fsSL "$RAW/.env.example" -o .env
  TOKEN=$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i.bak "s|^COACH_TOKEN=.*|COACH_TOKEN=$TOKEN|" .env && rm -f .env.bak
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "${IP:-}" ] && sed -i.bak "s|^PUBLIC_URL=.*|PUBLIC_URL=http://$IP:8080|" .env && rm -f .env.bak
  echo "Создан .env — при необходимости поправь PORT и PUBLIC_URL."
fi
mkdir -p data
docker compose pull
docker compose up -d
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-8080}
echo
echo "Готово. Открой http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT — первый зарегистрированный станет админом."
echo "Обновление: ./update.sh"
