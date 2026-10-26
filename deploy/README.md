# Развёртывание на VPS

Образы собирает GitHub Actions (`deploy.yml`), на VPS — только `pull` и `up`.

## Подготовка чистого VPS (один раз)

1. DNS: A/AAAA для `pokusochkam.ru` и `www.pokusochkam.ru`.
2. Файрвол: `ufw allow 22,80,443/tcp && ufw allow 443/udp && ufw enable`.
3. Пользователь: `adduser --disabled-password deploy && usermod -aG docker deploy`.
4. Каталог: `mkdir -p /opt/pokusochkam/backups && chown -R deploy /opt/pokusochkam`; в него положить `compose.prod.yml`, `deploy/deploy.sh` (в `/opt/pokusochkam/deploy.sh`), `deploy/backup.sh` (в `/opt/pokusochkam/deploy/backup.sh`).
5. `.env`: копия `.env.example` с настоящими паролями, `chmod 600`.
6. Вход в реестр под `deploy`: `docker login ghcr.io -u <user>` токеном `read:packages`.
7. SSH-ключ CI (ed25519) в `~deploy/.ssh/authorized_keys` с ограничением: `command="/opt/pokusochkam/deploy.sh",no-port-forwarding,no-pty,no-agent-forwarding ssh-ed25519 AAAA…`.
8. Секреты GitHub (environment `production`): `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.

## Деплой и откат
- Каждый push в `master` после зелёного CI: образы с тегом sha → `deploy.sh <sha>`; при провале `/api/health` возвращается прошлый тег (`.previous_tag`).
- Вручную: `ssh deploy@vps <40-символьный sha>`.
- Миграции применяются при старте API и должны быть аддитивными, иначе откат образа не поможет.

## Резервные копии
Сервис `backup` раз в сутки делает `pg_dump` в `/opt/pokusochkam/backups` (хранится 30 дней). Вторую копию вне VPS настройте отдельно (например, `rsync` по cron на другой хост) и раз в квартал проверяйте восстановление: `gunzip -c db-….sql.gz | docker compose -f compose.prod.yml exec -T db psql -U $POSTGRES_USER $POSTGRES_DB`.

## Офлайн-версия
Пункт меню «Скачать офлайн-версию» ведёт на страницу `/offline`: сервер вшивает выбранные дела в шаблон (`game.html` — только игра, `editor.html` — игра и конструктор) из папки `OFFLINE_DIR`. Шаблоны собираются в образе API (`Dockerfile`, этап `offline`: `vite build --mode offline` и `--mode offline-editor`), `OFFLINE_DIR=/app/offline`.
