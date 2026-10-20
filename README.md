# Parkly — parking marketplace (MERN)

Reserve verified private parking near your destination for a specific time window.
Hosts list unused spaces and earn. **Self-parking only — no key handover.**

> Brand name "Parkly" is a placeholder. UI tokens live in `client/src/globals.css`.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + React Router + Tailwind CSS v4 + Axios
- **Backend:** Node.js + Express + REST APIs
- **Database:** MongoDB + Mongoose (GeoJSON `2dsphere` on parking locations)
- **Auth:** JWT (bcrypt) + Google Identity Services (optional)
- **Maps:** Google Maps Platform (`VITE_GOOGLE_MAPS_API_KEY`; labelled mock map otherwise)
- **Payments:** Razorpay with server-side signature verification (mock mode when keys are unset)

## Layout

```text
project/
├── client/          React + Vite SPA
├── server/          Express + Mongoose API
├── .env.example
└── README.md
```

## Quick start

```bash
cd server && npm install
cd ../client && npm install

# optional: copy env files (dev works with in-memory MongoDB if MONGODB_URI is unset)
cp server/.env.example server/.env
cp client/.env.example client/.env

# terminal 1
cd server && npm run dev          # http://localhost:5000

# terminal 2
cd client && npm run dev          # http://localhost:5173
```

If `MONGODB_URI` is unset in development, the API starts an **in-memory MongoDB** and auto-seeds demo data (resets on restart). With Atlas, set `MONGODB_URI` then run `cd server && npm run seed`.

Demo accounts (password `password123`):

| Email | Role |
|---|---|
| `driver@parkly.dev` | Driver |
| `host@parkly.dev` | Host + driver |
| `admin@parkly.dev` | Admin |

Seed listings are fictional Mumbai-inspired demo data.

## Environment variables

**Server** (`server/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no | Default `5000` |
| `MONGODB_URI` | production | Atlas / MongoDB URL. Dev falls back to in-memory MongoDB |
| `JWT_SECRET` | production | JWT signing secret (`openssl rand -base64 32`) |
| `CLIENT_URL` | no | CORS origin, default `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | optional | Google login (token verified on the server) |
| `GOOGLE_CLIENT_SECRET` | optional | Google OAuth (not exposed to the client) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for checkout | Test or live Razorpay keys (secret stays on the server) |
| `RAZORPAY_WEBHOOK_SECRET` | for webhooks | Dashboard webhook secret; verifies the raw request body |
| `SMTP_*` / `EMAIL_FROM` | optional | Email notifications (in-app always works) |

**Client** (`client/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base. Leave `/api` in dev (Vite proxies to Express) |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JS API (HTTP-referrer restricted) |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services button |
| `VITE_RAZORPAY_KEY_ID` | Optional public key (API also returns `keyId`) |

Never put `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, or `RAZORPAY_KEY_SECRET` in the client.

## Commands

```bash
# server
cd server && npm run dev          # tsx watch (local)
cd server && npm run build        # compile TypeScript to dist/
cd server && npm start            # node dist/server.js
cd server && npm run seed         # MongoDB seed
cd server && npm run typecheck

# client
cd client && npm run dev          # Vite on :5173
cd client && npm run build
cd client && npm run typecheck
```

## External services

**Google OAuth** — [Google Cloud credentials](https://console.cloud.google.com/apis/credentials).
Create a Web client, add `http://localhost:5173` as an authorized JavaScript origin, set
`GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client). The backend verifies the
ID token and issues a Parkly JWT.

**Google Maps** — enable Maps JavaScript API, restrict by HTTP referrer, set
`VITE_GOOGLE_MAPS_API_KEY`. Without it, a labelled offline map keeps marker/selection behaviour.

**Razorpay** — see [docs/razorpay.md](docs/razorpay.md) for Test Mode setup.
The secret never leaves the server. Checkout uses `POST /api/payments/orders` + `POST /api/payments/verify`.
Webhook: `POST /api/payments/webhook` (`payment.captured` / `payment.failed`).

**Uploads** — `POST /api/upload` accepts JPEG, PNG, or WebP up to 5 MB (not SVG/GIF).
Production stores files on Cloudinary and returns a delivery URL plus `publicId`.
Development without Cloudinary still writes to `server/uploads` and returns `/uploads/...`.
Demo photos stay on `/demo`. Legacy `/uploads/...` URLs keep working via the API static server.
See [docs/cloudinary.md](docs/cloudinary.md). Never put Cloudinary secrets in `client/.env`.

## Production

1. Set `NODE_ENV=production`, a real `MONGODB_URI`, a strong `JWT_SECRET` (≥32 chars), and a public `CLIENT_URL` (the exact frontend origin).
2. Set `RAZORPAY_WEBHOOK_SECRET` if you use Razorpay webhooks.
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` on the API host (Render). The API will not boot in production without them.
4. Client: set `VITE_API_URL` to the public API base (for example `https://api.example.com/api`) when the SPA is on another host, then `cd client && npm run build`. Serve `client/dist` from a static host.
5. Server: `cd server && npm run build && npm start` (`node dist/server.js`). `tsx` is only for local `dev` / `seed`.
6. If the frontend and API are on different hosts, listing photos (`/uploads`, `/demo`) are resolved from `VITE_API_URL`. Cloudinary `https://` URLs are used as-is. Alternatively reverse-proxy `/uploads` and `/demo`.
