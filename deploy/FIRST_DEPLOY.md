# Первый деплой

1. Выполни миграцию общего reverse proxy из отдельного архива `reverse-proxy-migration.zip`.
2. Добавь GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
3. Загрузи содержимое проекта в корень репозитория.
4. Сделай push в `main`.

TemplateFiller использует сеть `shared-proxy` и не управляет Caddy самостоятельно.
