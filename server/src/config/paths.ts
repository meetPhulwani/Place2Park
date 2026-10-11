import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** `server/` whether this file is loaded from `src/config` or `dist/config`. */
export const SERVER_ROOT = path.resolve(here, "../..");
export const ENV_FILE = path.join(SERVER_ROOT, ".env");
export const UPLOADS_DIR = path.join(SERVER_ROOT, "uploads");
export const DEMO_DIR = path.join(SERVER_ROOT, "public", "demo");
