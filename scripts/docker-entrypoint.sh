#!/bin/sh
# Запускается root'ом: выравнивает права на /data (том с хоста), затем переключается на пользователя node.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data 2>/dev/null || true
  exec su-exec node "$@"
fi
exec "$@"
