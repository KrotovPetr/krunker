#!/bin/bash
# Installed as /usr/local/bin/krunker-deploy; invoked by the existing SSH key.
set -euo pipefail
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo 'Expected: deploy <40-character commit SHA>' >&2
  exit 1
fi
exec /usr/bin/sudo -n /usr/local/sbin/krunker-docker-deploy "${BASH_REMATCH[1]}"
