# Cloudinary listing images — Place2Park

Listing photos are uploaded by hosts through `POST /api/upload`. The server talks to Cloudinary; the browser never receives the API secret.

## 1. Credentials (server only)

1. Open the [Cloudinary console](https://console.cloudinary.com/) and copy **Cloud name**, **API Key**, and **API Secret**.
2. Put them only in `server/.env` (local) or the Render environment (production):

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Never put these in `client/.env`, never prefix them with `VITE_`, and never commit real values. Placeholders live in `server/.env.example` and the repo `.env.example`.

## 2. Behaviour

- Allowed types: JPEG, PNG, WebP. Max 5 MB. SVG and GIF are rejected.
- Response stays `{ success: true, data: { url } }` and may include `publicId` so later listing edits can delete the asset.
- Production boot requires the three variables above (`server/src/config/env.ts`).
- Local development without Cloudinary still saves to `server/uploads` and returns `/uploads/<file>`.
- `/demo` seed images are unchanged. Existing `/uploads/...` URLs still render from the API static directory when the file is present.

## 3. After deploy (manual)

1. Set the three Render variables and restart the API.
2. New listing photos go to Cloudinary. Existing listings that already use working `https://` or `/demo` URLs need no change.
3. Listings whose photos were `/uploads/...` on Render’s disk may already 404 if the instance restarted. Re-upload those photos in the host listing editor. Do not delete local `server/uploads` files until you have confirmed every listing URL either is Cloudinary, `/demo`, or a file you still serve.
