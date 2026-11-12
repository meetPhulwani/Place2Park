#!/bin/sh
# Writes the Nginx site at start. Runtime values are not stored in image layers.
set -eu

upstream="${API_UPSTREAM:-api:5000}"
resolver="${NGINX_RESOLVER:-127.0.0.11}"
console_path="${ADMIN_CONSOLE_PATH:-}"

case "$upstream" in
  *[!A-Za-z0-9.:_-]*|"")
    echo "API_UPSTREAM must be a host:port name." >&2
    exit 1
    ;;
esac
case "$resolver" in
  *[!A-Za-z0-9.:_-]*|"")
    echo "NGINX_RESOLVER must be a DNS address." >&2
    exit 1
    ;;
esac
if [ -n "$console_path" ]; then
  case "$console_path" in
    *[!A-Za-z0-9/_-]*)
      echo "ADMIN_CONSOLE_PATH contains a character this proxy will not accept." >&2
      exit 1
      ;;
    /*) ;;
    *)
      echo "ADMIN_CONSOLE_PATH must start with /." >&2
      exit 1
      ;;
  esac
  case "$console_path" in
    /api|/uploads|/demo|/health|/healthz)
      echo "ADMIN_CONSOLE_PATH uses a reserved public path." >&2
      exit 1
      ;;
  esac
fi

mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp

host=${upstream%%:*}
port=${upstream##*:}
case "$port" in
  ""|*[!0-9]*)
    echo "API_UPSTREAM must be a host:port name." >&2
    exit 1
    ;;
esac
if [ -z "$host" ] || [ "$host" = "$port" ]; then
  echo "API_UPSTREAM must be a host:port name." >&2
  exit 1
fi

awk \
  -v api_host="$host" \
  -v api_port="$port" \
  -v resolver="$resolver" \
  -v console_path="$console_path" \
  '
  function proxy() {
    print "      proxy_pass http://$api_host:$api_port;"
    print "      proxy_http_version 1.1;"
    print "      proxy_connect_timeout 5s;"
    print "      proxy_set_header Host $host;"
    print "      proxy_set_header X-Real-IP $remote_addr;"
    print "      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "      proxy_set_header X-Forwarded-Proto $scheme;"
  }
  /__RESOLVER__/ { gsub(/__RESOLVER__/, resolver) }
  /__API_HOST__/ { gsub(/__API_HOST__/, api_host) }
  /__API_PORT__/ { gsub(/__API_PORT__/, api_port) }
  /__CONSOLE_BLOCK__/ {
    if (console_path != "") {
      print "    location = " console_path " {"
      print "      return 301 " console_path "/;"
      print "    }"
      print "    location " console_path "/ {"
      proxy()
      print "      proxy_read_timeout 60s;"
      print "    }"
    }
    next
  }
  { print }
  ' /etc/nginx/place2park.template > /tmp/place2park.conf

exec nginx -g "daemon off;"
