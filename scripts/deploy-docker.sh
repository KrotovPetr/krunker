#!/bin/bash
# Root-owned helper. Never execute a Compose file from the writable checkout.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
if [[ $# != 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected one 40-character commit SHA' >&2
  exit 1
fi
[[ $EUID == 0 ]] || { echo 'Run via the installed sudo helper' >&2; exit 1; }

CONFIG_DIR=/etc/krunker
STATE_DIR=/var/lib/krunker-deploy
DOCKER=/usr/bin/docker
test -s "$CONFIG_DIR/deploy.env"
test -s "$CONFIG_DIR/compose.yaml"
install -d -m 700 "$STATE_DIR"
cd "$CONFIG_DIR"
exec 9> "$STATE_DIR/deploy.lock"
flock -w 900 9

# Only root-owned deploy.env may select images, public ports and hostname.
unset KRUNKER_IMAGE_PREFIX SITE_ADDRESS HTTP_PORT HTTPS_PORT
unset DOCKER_HOST DOCKER_CONTEXT COMPOSE_FILE COMPOSE_PROFILES COMPOSE_ENV_FILES
export KRUNKER_IMAGE_TAG="$1"
sha="$1"
previous=''
if [[ -f "$STATE_DIR/current.sha" ]]; then
  read -r previous < "$STATE_DIR/current.sha"
  [[ "$previous" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid current.sha' >&2; exit 1; }
fi

compose() {
  "$DOCKER" --host unix:///var/run/docker.sock --config /root/.docker compose \
    --project-name krunker --project-directory "$CONFIG_DIR" \
    --env-file "$CONFIG_DIR/deploy.env" -f "$CONFIG_DIR/compose.yaml" "$@"
}

compose config --quiet
# Both pulls finish before any running container is replaced.
compose pull
if compose up -d --no-build --pull never --wait --wait-timeout 120; then
  if [[ -n "$previous" && "$previous" != "$sha" ]]; then
    printf '%s\n' "$previous" > "$STATE_DIR/previous.sha.tmp"
    mv "$STATE_DIR/previous.sha.tmp" "$STATE_DIR/previous.sha"
  fi
  printf '%s\n' "$sha" > "$STATE_DIR/current.sha.tmp"
  mv "$STATE_DIR/current.sha.tmp" "$STATE_DIR/current.sha"
  printf 'Deployed %s\n' "$sha"
else
  echo 'Deployment failed; container logs follow' >&2
  compose logs --tail=80 || true
  if [[ -n "$previous" && "$previous" != "$sha" ]]; then
    export KRUNKER_IMAGE_TAG="$previous"
    if compose up -d --no-build --pull never --wait --wait-timeout 120; then
      printf 'Rolled back to %s\n' "$previous" >&2
    else
      echo 'Rollback also failed; administrative recovery is required' >&2
    fi
  else
    echo 'No earlier successful deployment is recorded; inspect the containers' >&2
  fi
  exit 1
fi
