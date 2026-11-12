# Docker

Docker runs the same Place2Park images locally and on a container host later. Vercel, Render, MongoDB Atlas, and the managed Redis service stay as they are. Compose does not start MongoDB or Redis.

The browser never uses the Docker name `api`. The production web image is Nginx on port **8080**. It serves the built site and proxies `/api`, `/uploads`, `/demo`, and `/health` to the API on the internal network. Build the site with `VITE_API_URL=/api` so those calls stay on the public origin. Set an absolute `VITE_API_URL` only when the browser must call a different public API host, then rebuild the web image.

The admin console is still a separate build (`CONSOLE_BUILD=1`) copied into the API image and served by the API at `ADMIN_CONSOLE_PATH`. Nginx forwards that one path when the variable is set on the web container. The console keeps calling `/api/console` on the page origin. Do not publish `dist-console` as the public site.

## Images

| Image | Dockerfile target | Process | Listen |
|---|---|---|---|
| `place2park-api` | `server/Dockerfile` `production` | `node dist/server.js` as user `node` | 5000, internal |
| `place2park-web` | `client/Dockerfile` `production` | Nginx as user `nginx` | 8080, published |

Development targets run `tsx` and Vite as the `node` user. The API container does not use the file watcher, so `SIGTERM` stops the process instead of starting it again. They are only for `docker-compose.dev.yml`. Named volumes hold `node_modules`, so the source bind mount does not hide them. When the lockfile matches the image, startup copies that install into the volume. When the lockfile changed, startup runs `npm ci`. The API dev server is `tsx`, which is the project's TypeScript runner. Nodemon is not a dependency. The development API image is Debian and includes `libcurl` so the existing in-memory database binary can start when `MONGODB_URI` is unset. The production image stays Alpine and still requires an external database. The production web image does not run Vite.

Secrets are runtime environment variables. They are not copied into image layers. `.env`, `node_modules`, `.git`, and private keys are excluded from the build context.

## Local production-mode containers

From the repository root. The production image has no in-memory database, so `server/.env` needs a development Atlas URI. `NODE_ENV=development` in `docker/runtime.env` seeds an empty database, so do not point `MONGODB_URI` at production.

`server/.env` is optional and overrides `docker/runtime.env` when it exists. For the built site, keep `VITE_API_URL=/api`. Public browser keys (`VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_RAZORPAY_KEY_ID`, `VITE_GA_MEASUREMENT_ID`) can be passed in the shell before `docker compose build`. Changing them requires a web image rebuild.

The API port is not published. The site is `http://localhost:8080`. `CLIENT_URL` for this local stack is `http://localhost:8080`.

## Local Vite stack

`docker-compose.dev.yml` mounts the source, runs Vite on port 5173, and proxies `/api` to the API container. The API port is still not published.

## Runtime variables

The API reads the same variables as Render. See `server/.env.example`. Production boot still requires `NODE_ENV=production`, a public `CLIENT_URL` that is not localhost, `MONGODB_URI`, a 32+ character `JWT_SECRET`, the Cloudinary trio, `RAZORPAY_WEBHOOK_SECRET`, `REDIS_URL`, `PAYOUT_ENCRYPTION_KEY`, `ADMIN_CONSOLE_PATH`, `ADMIN_SESSION_SECRET`, and `ADMIN_TOTP_KEY`.

Build-time browser values live in `client/.env.example`. `VITE_API_URL=/api` is the Docker same-origin setting.

On the web container only:

| Variable | Purpose |
|---|---|
| `API_UPSTREAM` | Default `api:5000`. Change it if the API service has another name |
| `ADMIN_CONSOLE_PATH` | Same secret path as the API. One URL segment. Leave empty to skip the proxy |
| `NGINX_RESOLVER` | Default `127.0.0.11` (Docker DNS). Answers are cached for 1 second |

## Health, logs, shutdown

- API health is `GET /health` and `GET /api/health`.
- Nginx's own check is `GET /healthz`. That route does not leave the web container.
- API logs go to stdout and stderr. Nginx access logs go to stdout.
- The API closes idle keep-alive connections on `SIGTERM` or `SIGINT`, stops the background maintenance timer, stops accepting requests, disconnects MongoDB, and quits Redis if a client was opened. A second signal does not close them again. Logs name the stage and do not include connection strings. A stuck close is forced after 15 seconds. Compose waits 20 seconds before a hard stop. Shutdown does not retry charges, captures, refunds, bookings, or payouts, and it does not mark a payment failed. Request, payment, and retry timeouts are unchanged.
- Nginx resolves the API service name through Docker DNS and caches that answer for 1 second, so a recreated API container receives traffic again without a web restart. Vite proxies `/api` to `http://api:5000`. The browser stays on the page origin.
- Upload files that are still written on disk use the `api-uploads` volume. Atlas and Redis are not stored in a volume.

## Tags and rollback

Tag images with the git revision you built, and keep the previous revision tag:

```text
place2park-api:<git-sha>
place2park-web:<git-sha>
```

Rollback is deploying the previous image tag or digest. Do not rebuild and hope the cache matches. The platform should pin the digest it rolled out.

## Cloud host, provider not chosen

1. Build the two production targets and push them to the host's registry.
2. Terminate HTTPS at the platform ingress. The containers speak HTTP. Send HSTS at that ingress. The API trusts one proxy hop, so the proxy that connects to the API must be the one whose `X-Forwarded-For` value is the client. With this Compose layout, that proxy is Nginx.
3. Publish only the web port (8080). Leave the API on the private network, except for the ingress route you intend to expose.
4. Put secrets in the host's secret store and inject them as environment variables at runtime. Do not bake them into the image.
5. Set `NODE_ENV=production` and `CLIENT_URL` to the public `https` origin.
6. Point Razorpay's webhook at `https://<public-host>/api/payments/webhook`.
7. Set `ADMIN_CONSOLE_PATH` on both containers to the same value. Open the console only at `https://<public-host><ADMIN_CONSOLE_PATH>/`.
8. Keep one API instance, or more than one only with the existing shared `REDIS_URL`. Booking, payment, payout, and admin rules are unchanged.
9. To roll back, redeploy the previous image digests and confirm `GET /health` returns `status: ok`.

## Windows PowerShell

Run these from `E:\project\Place2Park`.

```powershell
docker build -f server/Dockerfile --target production -t place2park-api:local .
docker build -f client/Dockerfile --target production -t place2park-web:local .
docker compose config
docker compose up -d
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose stop
docker compose down
docker compose build --no-cache
docker compose up -d --build
```

Development stack:

```powershell
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml down
```

Tag a revision before a cloud push:

```powershell
$sha = git rev-parse --short HEAD
docker build -f server/Dockerfile --target production -t "place2park-api:$sha" .
docker build -f client/Dockerfile --target production -t "place2park-web:$sha" .
```
