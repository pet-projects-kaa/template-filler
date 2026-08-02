# TemplateFiller: деплой через общий reverse proxy

Перед первым деплоем должен быть выполнен комплект `reverse-proxy-migration.zip`.

Приложение подключается к внешней Docker-сети:

```text
shared-proxy
```

Workflow больше не изменяет Caddyfile другого проекта. Он только:

1. загружает приложение;
2. собирает контейнер;
3. запускает его в `shared-proxy`;
4. проверяет локальный и публичный health-check.

GitHub Secrets:

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
```

Публичный адрес:

```text
https://annushkaaaaa.store/templates/
```
