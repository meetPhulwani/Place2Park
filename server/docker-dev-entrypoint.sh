#!/bin/sh
# The source bind mount hides image node_modules. The named volume keeps them.
# A matching lockfile is copied from the image. A changed lockfile runs npm ci.
set -eu
cd /app/server

lock_hash=$(sha256sum package-lock.json | awk 'NR==1 { print $1 }')
stamp="node_modules/.place2park-lock"
ready=0
if [ -x node_modules/.bin/tsx ] && [ -x node_modules/.bin/tsc ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$lock_hash" ]; then
  ready=1
fi

if [ "$ready" -eq 0 ]; then
  image_hash=""
  if [ -f /opt/place2park/server-package-lock.json ]; then
    image_hash=$(sha256sum /opt/place2park/server-package-lock.json | awk 'NR==1 { print $1 }')
  fi
  mkdir -p node_modules
  find node_modules -mindepth 1 -delete
  if [ -d /opt/place2park/server-node_modules ] && [ "$image_hash" = "$lock_hash" ]; then
    cp -a /opt/place2park/server-node_modules/. node_modules/
  else
    root=$(mktemp -d)
    cp /app/package.json "$root/package.json"
    mkdir -p "$root/server"
    cp package.json package-lock.json "$root/server/"
    cd "$root/server"
    npm ci
    find /app/server/node_modules -mindepth 1 -delete
    cp -a node_modules/. /app/server/node_modules/
    cd /app/server
    rm -rf "$root"
  fi
  printf '%s\n' "$lock_hash" > "$stamp"
  chown -R node:node node_modules
fi

mkdir -p uploads
chown node:node uploads 2>/dev/null || true
# tsx without watch: a file watcher would start the API again after SIGTERM.
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec node ./node_modules/.bin/tsx src/server.ts
fi
exec gosu node ./node_modules/.bin/tsx src/server.ts
