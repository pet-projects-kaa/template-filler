# Первый деплой

1. Общий reverse proxy должен быть уже запущен.
2. Docker-сеть `shared-proxy` должна существовать.
3. Добавь GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
4. Загрузи содержимое проекта в корень репозитория.
5. Сделай push в `main`.

Workflow:

- сохраняет каталог `$HOME/apps/template-filler/data` между релизами;
- собирает и запускает контейнер;
- подключает его к `shared-proxy`;
- проверяет локальный и публичный health-check.

База:

```text
$HOME/apps/template-filler/data/template-filler.db
```
