import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { allowedCorsOrigins } from "./config/cors.js";
import { env, isProd } from "./config/env.js";
import { DEMO_DIR, UPLOADS_DIR } from "./config/paths.js";

export function createApp() {
  const app = express();
  if (isProd) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      // API responses are not the document that opens the Google popup.
      // same-origin stays in place. The SPA uses same-origin-allow-popups.
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use(cors({ origin: allowedCorsOrigins(env.CLIENT_URL, env.NODE_ENV), credentials: false }));
  // Keep the raw body for Razorpay webhook signature verification.
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString();
      },
    })
  );

  app.get("/api/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));
  app.use("/api", routes);
  // Static: uploaded photos + demo images
  app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));
  app.use("/demo", express.static(DEMO_DIR, { maxAge: "7d" }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
