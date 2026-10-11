import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { env, isProd } from "./config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  if (isProd) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: false }));
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
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads"), { maxAge: "7d" }));
  app.use("/demo", express.static(path.resolve(__dirname, "../public/demo"), { maxAge: "7d" }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
