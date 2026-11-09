import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { isProd } from "./config/env.js";
import { adminConsolePath } from "./utils/admin-secret.js";
import { consoleAssetType } from "./utils/console-asset.js";

const PLACEHOLDER = "/__console_base__";

function applyConsoleDocumentHeaders(res: Response) {
  res.removeHeader("Content-Security-Policy");
  const script = isProd ? "'self'" : "'self' 'unsafe-inline'";
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src ${script}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self' ws:; base-uri 'none'; frame-ancestors 'none'`
  );
}

export function registerConsoleSpa(app: Express) {
  const consolePath = adminConsolePath();
  if (!consolePath) return;
  if (isProd) {
    app.use(consolePath, (req, res) => serveBuilt(req, res, consolePath));
    return;
  }
  let pending: Promise<express.RequestHandler> | null = null;
  app.use(consolePath, (req, res, next) => {
    pending ??= devHandler(consolePath);
    pending.then((handler) => handler(req, res, next)).catch(next);
  });
}

function serveBuilt(req: Request, res: Response, consolePath: string) {
  if (req.path.endsWith(".map")) {
    res.status(404).json({ success: false, message: "Not found." });
    return;
  }
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist-console");
  {
    const requested = (req.path === "/" ? "console.html" : req.path).replace(/^\/+/, "");
    const file = path.resolve(dir, requested);
    if (!file.startsWith(path.resolve(dir))) {
      res.status(404).json({ success: false, message: "Not found." });
      return;
    }
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dir, "console.html");
    if (!fs.existsSync(target)) {
      res.status(404).json({ success: false, message: "Not found." });
      return;
    }
    const body = fs.readFileSync(target);
    const text = body.toString("utf8").split(PLACEHOLDER).join(consolePath);
    if (target.endsWith(".html")) applyConsoleDocumentHeaders(res);
    res.setHeader("Content-Type", consoleAssetType(target));
    res.send(target.endsWith(".html") || target.endsWith(".js") || target.endsWith(".css") ? text : body);
  }
}

async function devHandler(consolePath: string): Promise<express.RequestHandler> {
  const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client");
  const requireFromClient = createRequire(path.join(clientRoot, "package.json"));
  const { createServer } = requireFromClient("vite") as {
    createServer: (options: object) => Promise<{
      middlewares: express.RequestHandler;
      transformIndexHtml: (url: string, html: string) => Promise<string>;
    }>;
  };
  const vite = await createServer({
    root: clientRoot,
    appType: "custom",
    server: { middlewareMode: true },
    base: `${consolePath}/`,
  });
  return (req, res, next) => {
    vite.middlewares(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (res.headersSent) return;
      const htmlPath = path.join(clientRoot, "console.html");
      const html = fs.readFileSync(htmlPath, "utf8").split(PLACEHOLDER).join(consolePath);
      vite.transformIndexHtml(req.originalUrl, html).then((transformed) => {
        applyConsoleDocumentHeaders(res);
        res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
      }).catch(next);
    });
  };
}
