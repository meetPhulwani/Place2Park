#!/bin/sh
# Root only long enough to make the upload directory writable, then drop to node.
set -eu
mkdir -p /app/server/uploads
chown node:node /app/server/uploads
cd /app/server
exec su-exec node /sbin/tini -- node dist/server.js
