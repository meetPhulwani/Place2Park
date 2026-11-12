#!/bin/sh
# The source bind mount hides image node_modules. The named volume keeps them.
# A matching lockfile is copied from the image. A changed lockfile runs npm ci.
set -eu
cd /app/client

lock_hash=$(sha256sum package-lock.json | awk 'NR==1 { print $1 }')
stamp="node_modules/.place2park-lock"
ready=0
if [ -x node_modules/.bin/vite ] && [ -x node_modules/.bin/tsc ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$lock_hash" ]; then
  ready=1
fi

if [ "$ready" -eq 0 ]; then
  image_hash=""
  if [ -f /opt/place2park/client-package-lock.json ]; then
    image_hash=$(sha256sum /opt/place2park/client-package-lock.json | awk 'NR==1 { print $1 }')
  fi
  mkdir -p node_modules
  find node_modules -mindepth 1 -delete
  if [ -d /opt/place2park/client-node_modules ] && [ "$image_hash" = "$lock_hash" ]; then
    cp -a /opt/place2park/client-node_modules/. node_modules/
  else
    root=$(mktemp -d)
    cp /app/package.json "$root/package.json"
    mkdir -p "$root/client"
    cp package.json package-lock.json "$root/client/"
    cd "$root/client"
    npm ci
    find /app/client/node_modules -mindepth 1 -delete
    cp -a node_modules/. /app/client/node_modules/
    cd /app/client
    rm -rf "$root"
  fi
  printf '%s\n' "$lock_hash" > "$stamp"
  chown -R node:node node_modules
fi

exec su-exec node ./node_modules/.bin/vite --host 0.0.0.0 --port 5173
