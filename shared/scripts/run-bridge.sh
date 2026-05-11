#!/usr/bin/env bash
set -euo pipefail
export $(grep -E "^[A-Z0-9_]+=.*$" /srv/eon-tech/secrets/eon-chat.env | xargs)
cd /srv/eon-tech/apps/eon-chat
exec /usr/bin/node /srv/eon-tech/apps/eon-chat/scripts/public-bridge.js
