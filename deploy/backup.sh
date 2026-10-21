#!/bin/sh
# Ежедневный pg_dump в /backups, хранится 30 дней. Запускается сервисом backup из compose.prod.yml.
set -eu
while true; do
  f="/backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "backup: $f"
  else
    rm -f "$f.tmp"
    echo "backup: ОШИБКА" >&2
  fi
  find /backups -name 'db-*.sql.gz' -mtime +30 -delete
  sleep 86400
done
