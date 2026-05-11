#!/usr/bin/env bash
set -euo pipefail
export $(grep -E "^[A-Z0-9_]+=.*$" /srv/eon-tech/secrets/eon-chat.env | xargs)
export CONTROL_PLANE_PORT=4180
cd /srv/eon-tech/apps/eon-chat
exec /usr/bin/node /srv/eon-tech/apps/eon-chat/src/server.js
