# Автодеплой из GitHub на VM

Схема: push в `main` → workflow `Checks` → тесты и сборка → SSH на VM → обновление игры. Pull request и другие ветки не запускают деплой.

Подготовлены [.github/workflows/ci.yml](.github/workflows/ci.yml) и [scripts/deploy-vm.sh](scripts/deploy-vm.sh). Пока repository variable `DEPLOY_ENABLED` не равна `true`, шаг деплоя пропускается. Настройка на реальной VM и запуск GitHub Actions пока не проверялись.

## 1. Сначала один раз запусти игру

Если VM только создана, выполни разделы 1–7 [инструкции первого запуска](DEPLOY_YANDEX_CLOUD.md). В результате должны быть:

- Ubuntu с Node.js и pnpm из проекта;
- репозиторий `/opt/krunker`;
- файл `/opt/krunker/apps/client/.env.production` с `VITE_SERVER_URL=https://твой-домен`;
- сайт в `/var/www/krunker`;
- служба `krunker.service`, которая работает от пользователя `fps`;
- настроенный Caddy и рабочий HTTPS.

Проверь сайт и создание комнаты до подключения автоматизации. Если репозиторий закрытый, у пользователя, который выполняет деплой, также должен быть доступ к чтению репозитория.

## 2. Создай отдельный ключ для GitHub Actions

На Mac, вне репозитория:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/krunker_github -C "github-actions-krunker" -N ''
scp -i ~/.ssh/krunker_deploy ~/.ssh/krunker_github.pub deploy@89.169.162.158:/tmp/krunker_github.pub
```

Статический адрес VM уже указан: `89.169.162.158`. Логин `deploy` и `~/.ssh/krunker_deploy` соответствуют предыдущей инструкции; если у тебя другие, подставь свои. При существующем файле ключа не перезаписывай его, выбери новое имя.

`krunker_github.pub` будет на VM, а приватный `krunker_github` попадёт только в GitHub Secret. Пустая парольная фраза нужна для неинтерактивного входа. Личный административный ключ в GitHub не загружай.

## 3. Подготовь пользователя и скрипт на VM

Если файлы автодеплоя ещё не попали в `main`, скопируй подготовленный скрипт с Mac:

```bash
cd /Users/peterkrotov/krunker
scp -i ~/.ssh/krunker_deploy scripts/deploy-vm.sh deploy@89.169.162.158:/tmp/krunker-deploy
```

На VM под своим административным пользователем:

```bash
sudo adduser --disabled-password --gecos '' github-deploy
sudo chown -R github-deploy:github-deploy /opt/krunker /var/www/krunker
sudo install -o root -g root -m 755 /tmp/krunker-deploy /usr/local/bin/krunker-deploy
sudo install -d -m 700 -o github-deploy -g github-deploy /home/github-deploy/.ssh
{
  printf 'restrict,command="/usr/local/bin/krunker-deploy" '
  cat /tmp/krunker_github.pub
} | sudo tee /home/github-deploy/.ssh/authorized_keys > /dev/null
sudo chown github-deploy:github-deploy /home/github-deploy/.ssh/authorized_keys
sudo chmod 600 /home/github-deploy/.ssh/authorized_keys
```

Это новый отдельный пользователь; не заменяй `authorized_keys` у своего административного пользователя. Ключ GitHub запускает только установленный скрипт. Тот принимает команду вида `deploy <SHA>` и отвергает произвольные команды. Опция `restrict` отключает терминал и перенаправление портов. [Формат authorized_keys](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT).

Разреши этому пользователю только остановку и запуск службы игры:

```bash
sudo tee /etc/sudoers.d/krunker-github > /dev/null <<'EOF'
github-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl stop krunker.service, /usr/bin/systemctl start krunker.service
EOF
sudo chmod 440 /etc/sudoers.d/krunker-github
sudo visudo -cf /etc/sudoers.d/krunker-github
sudo -H -u github-deploy node --version
sudo -H -u github-deploy pnpm --version
sudo -H -u github-deploy git -C /opt/krunker ls-remote origin refs/heads/main
```

Последняя команда должна показать SHA ветки `main`. Если она запрашивает пароль или не имеет доступа, настрой чтение GitHub для `github-deploy` до следующего шага. Для приватного репозитория подойдёт отдельный read-only GitHub Deploy Key: его приватная часть хранится на VM, публичная добавляется в Settings → Deploy keys репозитория. Это второй ключ, отдельный от ключа входа Actions на VM. Настрой для него SSH URL `git@github.com:KrotovPetr/krunker.git`, проверь ключ хоста GitHub и повтори `ls-remote`. [GitHub Deploy Keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Пользователь `fps`, служба systemd и Caddy сохраняют прежние настройки. После передачи репозитория пользователю `github-deploy` ручные Git/pnpm-команды на VM нужно выполнять от его имени через `sudo -H -u github-deploy`.

## 4. Разреши соединение от GitHub runner

В предыдущей инструкции TCP 22 открыт только с твоего домашнего IP. Этого недостаточно: обычный `ubuntu-latest` runner GitHub приходит с другого, меняющегося адреса. GitHub не рекомендует использовать все адреса стандартных runners как постоянный allowlist. [Адреса GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#ip-addresses).

Для простого запуска можно открыть TCP 22 с `0.0.0.0/0`, предварительно оставив SSH-вход только по ключам. На VM:

```bash
sudo tee /etc/ssh/sshd_config.d/00-krunker-keys.conf > /dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo /usr/sbin/sshd -t
sudo systemctl reload ssh
sudo /usr/sbin/sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
```

Все три значения должны быть `no`. Оставь текущий SSH-сеанс открытым и проверь административный вход по ключу из второго терминала Mac. Затем в группе безопасности VM разреши входящий TCP 22 с `0.0.0.0/0`. Если включён UFW, его правила тоже должны пропускать подключение. 80/443 остаются открыты, 2567 остаётся закрытым.

Это делает SSH доступным из интернета, но вход остаётся по ключу. Если открывать 22 для всех не подходит, используй runner с постоянным IP или отдельный runner/VPN с доступом к VM; тогда потребуется изменить `runs-on`/сетевую настройку. Не устанавливай общий runner для непроверенных pull requests прямо на игровой VM.

## 5. Добавь три секрета GitHub

В репозитории открой **Settings → Secrets and variables → Actions → Secrets → New repository secret**. [Настройка repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

| Имя                  | Значение                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `DEPLOY_HOST`        | `89.169.162.158`, без `https://` и без порта                                |
| `DEPLOY_SSH_KEY`     | Всё содержимое приватного `~/.ssh/krunker_github`, включая BEGIN/END строки |
| `DEPLOY_KNOWN_HOSTS` | Проверенный публичный ключ SSH-хоста VM в формате ниже                      |

Чтобы скопировать приватный ключ на Mac прямо в буфер, не выводя его в терминал:

```bash
pbcopy < ~/.ssh/krunker_github
```

Вставь его в значение `DEPLOY_SSH_KEY`. Не отправляй приватный ключ в чат и не добавляй его в репозиторий.

Для `DEPLOY_KNOWN_HOSTS` через уже установленное доверенное административное SSH-соединение на VM выполни:

```bash
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

Это публичный ключ сервера. Из строки `ssh-ed25519 AAAAC3... комментарий` сделай строку с IP впереди и без комментария:

```text
89.169.162.158 ssh-ed25519 AAAAC3...
```

IP уже указан. Впиши полный ключ вместо `AAAAC3...`. GitHub будет проверять идентичность VM, а не соглашаться на любой SSH-сервер. После пересоздания VM секрет нужно обновить с новым проверенным host key. Проверку `StrictHostKeyChecking` отключать не нужно.

## 6. Включи автодеплой

В **Settings → Secrets and variables → Actions → Variables** создай именно repository variable:

```text
Name: DEPLOY_ENABLED
Value: true
```

Файлы workflow и скрипта должны попасть в `main`. Если они пока только локально, на Mac из проекта:

```bash
git add .github/workflows/ci.yml scripts/deploy-vm.sh scripts/deploy-vm.test.mjs DEPLOY_GITHUB.md DEPLOY_YANDEX_CLOUD.md
git commit -m "ci: add SSH deployment to game VM"
git push origin main
```

Эти команды отправляют именно перечисленные файлы. Если их уже закоммитили и отправили ранее, повторять коммит не нужно: в GitHub Actions открой успешный запуск `Checks` для текущего `main` и выбери Re-run all jobs.

Открой **Actions → Checks**. Сначала выполняется `check`, затем `Deploy to VM`. Успешный лог деплоя заканчивается ответом `/health` и строкой `Deployed <SHA>`. После этого проверь сайт и создание комнаты в браузере.

Workflow передаёт SHA проверенного коммита. Если за время тестов в `main` пришёл новый коммит, старый запуск пропускает деплой и ждёт проверок нового. Одновременно может выполняться только одно обновление.

## Как происходят последующие обновления

Обычный `git push origin main` запускает тот же процесс. Перед сборкой скрипт останавливает `krunker.service`, затем устанавливает зависимости, собирает игру, обновляет статические файлы и запускает службу. Обновление занимает время установки и сборки; текущие комнаты завершаются. Это деплой с перерывом в работе, без автоматического отката.

При неуспешной сборке служба остаётся остановленной. Ошибка видна в Actions; частично собранная версия не запускается. После исправления можно отправить новый коммит либо повторить проверки текущего. Если изменились версии Node.js/pnpm, обнови их на VM; скрипт обнаружит несовпадение до остановки игры.

Сам `/usr/local/bin/krunker-deploy` установлен администратором и не перезаписывается автоматически. При изменении скрипта в репозитории скопируй его на VM и снова установи командой `sudo install -o root -g root -m 755 ... /usr/local/bin/krunker-deploy`.

## Ошибки и ручное восстановление

| Ошибка                                  | Действие                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Deploy to VM` пропущен                 | Проверь успех `check`, ветку `main`, событие push и repository variable `DEPLOY_ENABLED=true` |
| `Connection timed out`                  | Проверь TCP 22 в группе безопасности и UFW, публичный IP и доступность VM для runner          |
| `Permission denied (publickey)`         | Проверь соответствие ключей, пользователя `github-deploy`, права `.ssh` и `authorized_keys`   |
| `Host key verification failed`          | Проверь `DEPLOY_KNOWN_HOSTS` через доверенный административный вход                           |
| `sudo: a password is required`          | Проверь файл `/etc/sudoers.d/krunker-github` и точные команды systemctl                       |
| `Deployment checkout has local changes` | Разбери изменения в `/opt/krunker`; не удаляй их вслепую                                      |
| Ошибка fetch / `ls-remote`              | Настрой доступ именно пользователя `github-deploy` к GitHub                                   |
| Ошибка install/build                    | Исправь ошибку из лога, проверь версии инструментов и память VM                               |

Административная диагностика на VM:

```bash
sudo systemctl status krunker --no-pager
sudo journalctl -u krunker -n 100 --no-pager
sudo journalctl -u ssh -n 100 --no-pager
```

Если сборка упала, сначала исправь причину. Ручная повторная сборка и запуск:

```bash
sudo -H -u github-deploy bash -c '
  set -euo pipefail
  cd /opt/krunker
  exec 9> .git/deploy.lock
  flock -w 900 9
  sudo -n /usr/bin/systemctl stop krunker.service
  pnpm install --frozen-lockfile
  pnpm build
  rsync -a --delete apps/client/dist/ /var/www/krunker/
  chmod -R a+rX /var/www/krunker
  sudo -n /usr/bin/systemctl start krunker.service
  curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:2567/health
'
```

Для временного отключения автодеплоя установи `DEPLOY_ENABLED=false`. Обычные проверки продолжат работать. Для отзыва доступа удали ключ из `/home/github-deploy/.ssh/authorized_keys` и соответствующий секрет GitHub.
