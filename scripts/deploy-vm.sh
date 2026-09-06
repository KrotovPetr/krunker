#!/usr/bin/env bash
# Install as root-owned /usr/local/bin/krunker-deploy. Runs as github-deploy.
set -euo pipefail
umask 022

APP_DIR=/opt/krunker
STATIC_DIR=/var/www/krunker
export GIT_TERMINAL_PROMPT=0

# The dedicated SSH key may request exactly one operation, never a shell.
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo 'Expected: deploy <40-character commit SHA>' >&2
  exit 1
fi
sha=${BASH_REMATCH[1]}
cd "$APP_DIR"

# Also serialize requests outside GitHub Actions, including manual retries.
exec 9> .git/deploy.lock
flock -w 900 9
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Deployment checkout has local changes. Resolve them before retrying.' >&2
  exit 1
fi
git fetch --no-tags origin main
latest=$(git rev-parse FETCH_HEAD)
if [[ "$sha" != "$latest" ]]; then
  echo 'Skipped: a newer main commit is awaiting its own checks.'
  exit 0
fi
test -s apps/client/.env.production
test -w "$STATIC_DIR"
expected_node=$(git show "$sha:.nvmrc" | tr -d '\r\n')
test "$(node --version)" = "v$expected_node"
expected_pnpm=$(git show "$sha:package.json" | node -e '
  let text = "";
  process.stdin.on("data", (chunk) => text += chunk);
  process.stdin.on("end", () => console.log(JSON.parse(text).packageManager.split("@")[1]));
')
test "$(pnpm --version)" = "$expected_pnpm"

# Maintenance deployment: existing rooms end here. A failed build leaves the
# service stopped, with the failure visible in Actions, instead of starting a
# partially updated application. Recovery is documented in DEPLOY_GITHUB.md.
sudo -n /usr/bin/systemctl stop krunker.service
git checkout --detach "$sha"
pnpm install --frozen-lockfile
pnpm build
rsync -a --delete apps/client/dist/ "$STATIC_DIR/"
chmod -R a+rX "$STATIC_DIR"
sudo -n /usr/bin/systemctl start krunker.service
curl --connect-timeout 2 --max-time 5 --retry 10 --retry-connrefused \
  --retry-delay 1 --retry-max-time 60 -fsS http://127.0.0.1:2567/health
printf '\nDeployed %s\n' "$sha"
