#!/bin/sh
# Деплой образов с тегом <sha>. Вызывается по SSH (sha — аргумент или SSH_ORIGINAL_COMMAND).
# При провале проверки возвращает прошлый тег.
set -eu
cd /opt/pokusochkam
TAG="${1:-${SSH_ORIGINAL_COMMAND:-}}"
case "$TAG" in
  *[!0-9a-f]* | "") echo "bad tag" >&2; exit 2 ;;
esac
[ "${#TAG}" -eq 40 ] || { echo "bad tag" >&2; exit 2; }

PREV="$(cat .previous_tag 2>/dev/null || true)"
export IMAGE_TAG="$TAG"
dc() { docker compose -f compose.prod.yml "$@"; }

if dc pull && dc up -d --wait --remove-orphans && curl -fsS --retry 5 --retry-delay 3 https://pokusochkam.ru/api/health >/dev/null; then
  echo "$TAG" > .previous_tag
  docker image prune -f >/dev/null
  echo "deployed $TAG"
else
  echo "deploy failed" >&2
  if [ -n "$PREV" ]; then
    export IMAGE_TAG="$PREV"
    dc up -d --wait --remove-orphans || true
    echo "rolled back to $PREV" >&2
  fi
  exit 1
fi
