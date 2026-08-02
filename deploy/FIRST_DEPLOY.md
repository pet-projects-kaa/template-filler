# Деплой TemplateFiller

После загрузки файлов в GitHub первый push в ветку `main` запускает деплой автоматически.

## GitHub Actions secrets

В репозитории открой:

`Settings → Secrets and variables → Actions → New repository secret`

Добавь:

- `VPS_HOST` — `144.31.48.138`
- `VPS_USER` — `deploy`
- `VPS_SSH_KEY` — приватный SSH-ключ пользователя `deploy`

## Что workflow делает сам

1. Создаёт `/home/deploy/apps/template-filler` и постоянную папку `data`.
2. Загружает новую версию проекта.
3. Подключает контейнер к существующей сети `vk-friends-monitor_web`.
4. Собирает и запускает `template-filler` на `127.0.0.1:5082`.
5. Находит `/opt/vk-friends-monitor/Caddyfile` и идемпотентно добавляет маршрут `/templates/`.
6. Проверяет конфигурацию Caddy; при ошибке возвращает предыдущий Caddyfile.
7. Перезагружает Caddy без остановки остальных приложений.
8. Проверяет `https://annushkaaaaa.store/templates/health`.

Вручную создавать каталоги или редактировать Caddyfile не требуется.

## Что уже должно быть на VPS

- Docker и Docker Compose;
- существующий проект Caddy в `/opt/vk-friends-monitor`;
- Docker-сеть `vk-friends-monitor_web`;
- пользователь `deploy`, который может запускать Docker напрямую либо через беспарольный `sudo docker`.

Доступ к Docker позволяет workflow обновить bind-mounted Caddyfile даже без интерактивного ввода пароля `sudo`.

## Где хранятся шаблоны

```text
/home/deploy/apps/template-filler/data/templates.json
```

Папка `data` сохраняется при каждом последующем деплое.
