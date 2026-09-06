# Ручной деплой игры на Yandex Cloud VM

Инструкция для текущего проекта, коммит `f92f28e`. Документация сверена 6 сентября 2026 года. На облачной VM эти команды пока не выполнялись.

Схема: браузер → HTTPS / WSS → Caddy → статические файлы клиента или Node.js на `127.0.0.1:2567`. Один процесс игры запускает systemd. База данных, Redis и контейнеры для этого варианта не нужны.

Нужен собственный домен или поддомен. Публичный статический IPv4 VM: `89.169.162.158`. Во всех командах ниже замени `play.example.com` на свой домен. Команды предназначены для новой Ubuntu VM. Выполняй блоки по порядку; при ошибке остановись и исправь её перед следующим шагом.

## 1. Создай VM

Для первого запуска с друзьями предлагаю:

| Параметр  | Значение                          |
| --------- | --------------------------------- |
| ОС        | Ubuntu 24.04 LTS Vanilla, x86_64  |
| Платформа | Intel Ice Lake                    |
| Процессор | 2 vCPU, гарантированная доля 100% |
| Память    | 4 ГБ                              |
| Диск      | SSD, 20 ГБ                        |
| Тип VM    | Обычная, непрерываемая            |
| Сеть      | Публичный IPv4                    |

Это начальная конфигурация для проверки игры, без обещания конкретного числа одновременных комнат. Для игрового сервера выбираю 100% CPU, чтобы избежать зависимости симуляции от доступности разделяемых ресурсов. [Уровни производительности Yandex Cloud](https://yandex.cloud/ru/docs/compute/concepts/performance-levels).

На Mac создай отдельный SSH-ключ. Если такой файл уже существует, используй его или выбери другое имя, не перезаписывай существующий ключ:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/krunker_deploy -C "krunker-deploy"
cat ~/.ssh/krunker_deploy.pub
```

В консоли Yandex Cloud открой каталог → Compute Cloud → Виртуальные машины → Создать. Выбери образ Ubuntu 24.04 LTS Vanilla и параметры выше. В разделе доступа выбери SSH-ключ, логин `deploy`, добавь содержимое файла `.pub`. Приватный ключ остаётся на Mac. Если организация требует OS Login, используй предусмотренный ею способ подключения; далее нужен пользователь с `sudo`. [Создание Linux VM](https://yandex.cloud/ru/docs/compute/operations/vm-create/create-linux-vm), [Ubuntu Vanilla](https://yandex.cloud/ru/marketplace/products/yc/ubuntu-24-04-lts).

Создай собственную группу безопасности и назначь её VM. Входящие правила:

| Протокол | Порт | Источник                              |
| -------- | ---- | ------------------------------------- |
| TCP      | 22   | Твой публичный IPv4 с суффиксом `/32` |
| TCP      | 80   | `0.0.0.0/0`                           |
| TCP      | 443  | `0.0.0.0/0`                           |

Для исходящего трафика разреши любой протокол, все порты, назначение `0.0.0.0/0`. При смене домашнего публичного IP обнови правило SSH. Порты 2567 и 5173 наружу не открывай. Если на интерфейсе несколько групп, разрешения суммируются: не добавляй одновременно группу, открывающую все порты. [Группы безопасности](https://yandex.cloud/ru/docs/vpc/concepts/security-groups), [создание группы](https://yandex.cloud/ru/docs/vpc/operations/security-group-create).

После создания VM открой VPC → Публичные IP-адреса → меню её адреса → Сделать статическим. [Преобразование IP в статический](https://yandex.cloud/ru/docs/vpc/operations/set-static-ip).

## 2. Настрой домен и подключись

У провайдера, который обслуживает DNS твоего домена, создай запись:

```text
Тип: A
Имя: play
Значение: 89.169.162.158
TTL: 300
```

Так получается `play.example.com`. Cloud DNS использовать необязательно; если DNS уже у регистратора, добавь запись там. Не оставляй для этого имени AAAA-запись, ведущую на другой сервер. Для HTTPS домен должен указывать на VM, а TCP 80 и 443 должны быть доступны извне. [Условия автоматического HTTPS в Caddy](https://caddyserver.com/docs/automatic-https).

Проверь с Mac и подключись:

```bash
dig +short A play.example.com
ssh -i ~/.ssh/krunker_deploy deploy@89.169.162.158
```

В ответе `dig` должен быть адрес VM. Все команды следующих разделов выполняются внутри SSH-сеанса на VM. [Подключение к VM по SSH](https://yandex.cloud/ru/docs/compute/operations/vm-connect/ssh).

## 3. Установи зависимости и скачай проект

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates xz-utils gnupg rsync dnsutils debian-keyring debian-archive-keyring apt-transport-https
sudo install -d -m 755 -o "$(id -un)" -g "$(id -gn)" /opt/krunker
git clone https://github.com/KrotovPetr/krunker.git /opt/krunker
cd /opt/krunker
```

Если GitHub просит авторизацию, сначала настрой доступ к репозиторию своим способом, например deploy key. Не вставляй токен в URL клонирования.

Проект фиксирует Node.js `24.20.0` в `.nvmrc` и pnpm `10.34.5` в `package.json`. Устанавливаем официальный Linux x64 архив Node в `/usr/local`, чтобы systemd использовал стабильный путь. Блок выполняется в отдельной оболочке и прекращается при ошибке проверки архива. [Node.js 24.20.0](https://nodejs.org/en/blog/release/v24.20.0), [установка pnpm 10 через npm](https://pnpm.io/10.x/installation#using-npm).

```bash
(
  set -euo pipefail
  FPS_NODE_TMP=$(mktemp -d)
  cd "$FPS_NODE_TMP"
  curl -fSLO https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.xz
  curl -fSLO https://nodejs.org/dist/v24.20.0/SHASUMS256.txt
  sha256sum --check --ignore-missing SHASUMS256.txt
  sudo tar -xJf node-v24.20.0-linux-x64.tar.xz -C /usr/local --strip-components=1
  sudo /usr/local/bin/npm install --global pnpm@10.34.5
)
node --version
pnpm --version
```

Ожидаемые версии: `v24.20.0` и `10.34.5`.

## 4. Собери игру под свой домен

```bash
(
  set -euo pipefail
  cd /opt/krunker
  cat > apps/client/.env.production <<'EOF'
VITE_SERVER_URL=https://play.example.com
EOF
  pnpm install --frozen-lockfile
  pnpm build
  sudo install -d -m 755 /var/www/krunker
  sudo rsync -a --delete apps/client/dist/ /var/www/krunker/
  sudo chmod -R a+rX /var/www/krunker
)
```

В `.env.production` должен стоять твой домен. Клиент читает `VITE_SERVER_URL` при сборке, поэтому после смены домена нужна повторная сборка. Здесь URL без порта 2567: браузер обращается к Caddy на HTTPS-порту 443, а SDK использует WSS для игрового соединения. Это следует из [кода подключения](apps/client/src/network/connection.ts).

Для сборки нужны devDependencies. Не устанавливай только production-зависимости и не выставляй `NODE_ENV=production` перед `pnpm install`. Production-режим серверу зададим отдельно. Для публичной раздачи используется `apps/client/dist`, Vite dev/preview запускать не нужно.

## 5. Запусти игровой сервер через systemd

Создай отдельного системного пользователя без интерактивного входа и службу:

```bash
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin fps
sudo tee /etc/systemd/system/krunker.service > /dev/null <<'EOF'
[Unit]
Description=Krunker browser game server
After=network.target

[Service]
Type=simple
User=fps
Group=fps
WorkingDirectory=/opt/krunker
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=2567
ExecStart=/usr/local/bin/node /opt/krunker/apps/server/dist/index.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now krunker
sudo systemctl status krunker --no-pager
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:2567/health
```

Ожидаемый ответ для текущей версии: `{"status":"ok","protocolVersion":12}`. Номер протокола может измениться в последующих коммитах. Если служба не запускается, смотри `sudo journalctl -u krunker -n 100 --no-pager`.

Если в системе задан строгий `umask`, проверь, что пользователь `fps` может читать `/opt/krunker`, `node_modules` и собранные пакеты. Служба использует переменные окружения из unit-файла: сервер сам не загружает `.env`. [Запуск и остановка сервера](apps/server/src/index.ts), [health endpoint](apps/server/src/runtime/server.ts).

## 6. Установи Caddy и включи HTTPS

Добавь официальный stable-репозиторий Caddy. Пакет создаёт системную службу `caddy`. [Официальная установка для Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).

```bash
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /tmp/krunker-caddy-key.asc
sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/krunker-caddy-key.asc
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /tmp/krunker-caddy-stable.list
sudo install -m 644 /tmp/krunker-caddy-stable.list /etc/apt/sources.list.d/caddy-stable.list
sudo chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo apt-get update
sudo apt-get install -y caddy
```

Создай конфигурацию. Замени домен в первой строке на свой:

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
play.example.com {
    encode zstd gzip

    @game path /health /matchmake /matchmake/*
    handle @game {
        reverse_proxy 127.0.0.1:2567
    }

    @socket header Upgrade websocket
    handle @socket {
        reverse_proxy 127.0.0.1:2567
    }

    handle {
        root * /var/www/krunker
        header Cache-Control "no-cache"
        file_server
    }
}
EOF
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

`/matchmake/*` обслуживает создание и вход в комнаты. WebSocket идёт по отдельному адресу `/<processId>/<roomId>`, поэтому для него есть правило по заголовку Upgrade. Нельзя проксировать только `/matchmake/*`, иначе меню загрузится, но бой не подключится. Caddy сам поддерживает WebSocket upgrade. [Reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [правила handle](https://caddyserver.com/docs/caddyfile/directives/handle).

Caddy получает и продлевает сертификат автоматически. Отдельный Certbot или сертификат из Yandex Certificate Manager для этой схемы не требуется. На VM должны быть свободны порты 80/443; если включён UFW, разреши в нём SSH, TCP 80 и TCP 443. [Автоматический HTTPS](https://caddyserver.com/docs/automatic-https).

## 7. Проверь запуск

На VM:

```bash
curl -fsS http://127.0.0.1:2567/health
sudo ss -lntp
sudo systemctl is-active krunker caddy
```

Node должен слушать `127.0.0.1:2567`, Caddy обслуживать внешние 80/443, обе службы должны быть `active`.

На Mac:

```bash
curl -I https://play.example.com
curl -fsS https://play.example.com/health
```

Далее открой `https://play.example.com`, создай комнату и войди в бой. Проверь движение, стрельбу и волны. Отправь ссылку комнаты другу или открой её во втором браузере. В DevTools → Network должны быть успешный запрос `/matchmake/create/arena` и WebSocket-соединение со статусом 101. Проверка `/health` сама по себе не проверяет WebSocket и создание комнаты.

После закрытия SSH-сеанса игра продолжает работать. Обе службы запускаются при загрузке VM.

## 8. Обновляй после новых коммитов

Перезапуск игрового процесса завершает текущие комнаты. Выбери время, когда никто не играет. Текущая игра хранит матчи в памяти, а личные рекорды находятся в браузере игрока. Запускается один процесс, без PM2 cluster и нескольких реплик: для распределённых комнат понадобится отдельная настройка Colyseus.

На VM выполни этот блок. При ошибке он остановится, а сервер останется выключенным до исправления:

```bash
(
  set -euo pipefail
  cd /opt/krunker
  sudo systemctl stop krunker
  git pull --ff-only origin main
  pnpm install --frozen-lockfile
  pnpm build
  sudo rsync -a --delete apps/client/dist/ /var/www/krunker/
  sudo chmod -R a+rX /var/www/krunker
  sudo systemctl start krunker
  curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:2567/health
)
```

`rsync --delete` синхронизирует только каталог статического сайта `/var/www/krunker`, удаляя старые файлы сборки. `.env.production` остаётся на VM и не перезаписывается Git. Если обновились `.nvmrc` или `packageManager`, перед установкой зависимостей обнови инструменты до указанных в проекте версий. После обновления клиентам нужно перезагрузить страницу, особенно при смене протокола. Перезагрузка Caddy для обычного обновления статических файлов не нужна.

## Если что-то не работает

| Симптом                                  | Что проверить                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| SSH не подключается                      | Публичный IP, логин `deploy`, выбранный ключ, назначенную группу безопасности и текущий домашний IPv4 в правиле TCP 22 |
| HTTPS не открывается                     | A/AAAA-записи, доступность 80/443 и логи Caddy                                                                         |
| Сайт есть, комната не создаётся          | Значение `VITE_SERVER_URL` в `.env.production`, повторную сборку, `/health` и маршрут `/matchmake/*`                   |
| Комната создаётся, соединение обрывается | Правило WebSocket Upgrade, службу Node; запрос должен идти на `wss://твой-домен`, без `:2567`                          |
| 502                                      | `sudo systemctl status krunker` и `curl http://127.0.0.1:2567/health`                                                  |
| `Unsupported engine`                     | `node --version`, `pnpm --version`, `.nvmrc`, `packageManager`                                                         |
| Сборка завершилась `Killed`              | Свободную память и OOM в `sudo journalctl -k`; увеличь RAM VM при нехватке                                             |
| Просадки в нескольких комнатах           | CPU и RAM VM. Графика рисуется на компьютерах игроков, серверная VM рассчитывает физику, ботов и сеть                  |

Полезные команды:

```bash
sudo journalctl -u krunker -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo journalctl -u krunker -f
free -h
df -h
top
```

Первый запуск имеет смысл проверить небольшой компанией и по загрузке подобрать размер VM. Приведённые команды не создают мониторинг, резервное развёртывание или автоматические релизы.
