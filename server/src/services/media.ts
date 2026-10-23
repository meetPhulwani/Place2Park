import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { UPLOADS_DIR } from "../config/paths.js";
import { ApiError } from "../middleware/error.js";

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const CLOUDINARY_FOLDER = "place2park/listings";
export const UPLOAD_ERROR_MESSAGE = "Upload a JPEG, PNG or WebP image up to 5 MB.";

export type CloudinaryEnv = {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
};

export type StoredListingImage = { url: string; publicId?: string };

export type UploadListingImageFn = (input: {
  buffer: Buffer;
  mimetype: string;
}) => Promise<{ url: string; publicId: string }>;

export type DestroyListingImageFn = (publicId: string) => Promise<void>;

export function cloudinaryConfigured(cfg: CloudinaryEnv = env): boolean {
  return Boolean(cfg.CLOUDINARY_CLOUD_NAME && cfg.CLOUDINARY_API_KEY && cfg.CLOUDINARY_API_SECRET);
}

export function isAllowedUploadMime(mime: string | undefined): boolean {
  return Boolean(mime && ALLOWED_UPLOAD_TYPES[mime]);
}

export function isManagedPublicId(publicId?: string): boolean {
  return Boolean(publicId && publicId.startsWith(`${CLOUDINARY_FOLDER}/`));
}

export function listingImageFolder(hostId?: string) {
  return hostId ? `${CLOUDINARY_FOLDER}/${hostId}` : CLOUDINARY_FOLDER;
}

export function isOwnedPublicId(hostId: string, publicId?: string): boolean {
  if (!isManagedPublicId(publicId) || !hostId) return false;
  if (publicId!.startsWith(`${listingImageFolder(hostId)}/`)) return true;
  const rest = publicId!.slice(CLOUDINARY_FOLDER.length + 1);
  return rest.length > 0 && !rest.includes("/");
}

export function sanitizeListingImages(
  hostId: string,
  previous: { url?: string; publicId?: string }[],
  next: { url: string; publicId?: string }[]
): { url: string; publicId?: string }[] {
  const previousIds = new Set(
    previous.map((img) => img.publicId).filter((id): id is string => isManagedPublicId(id))
  );
  return next.map((img) => {
    if (!isManagedPublicId(img.publicId)) {
      return { url: img.url, ...(img.publicId ? { publicId: img.publicId } : {}) };
    }
    if (previousIds.has(img.publicId!) || isOwnedPublicId(hostId, img.publicId)) {
      return { url: img.url, publicId: img.publicId };
    }
    return { url: img.url, publicId: "" };
  });
}

export function canDestroyPublicId(hostId: string | undefined, publicId: string): boolean {
  if (!isManagedPublicId(publicId)) return false;
  if (!hostId) return true;
  return isOwnedPublicId(hostId, publicId);
}

export function validateUploadFile(file: { mimetype?: string; size?: number; buffer?: Buffer }) {
  const size = file.size ?? file.buffer?.length ?? 0;
  if (!isAllowedUploadMime(file.mimetype) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, UPLOAD_ERROR_MESSAGE);
  }
}

async function defaultCloudinaryUpload(input: { buffer: Buffer; mimetype: string }, hostId?: string) {
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: listingImageFolder(hostId),
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (err, result) => {
        if (err || !result?.secure_url || !result.public_id) {
          reject(err ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(input.buffer);
  });
}

async function defaultCloudinaryDestroy(publicId: string) {
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

export async function uploadListingImage(
  file: { buffer: Buffer; mimetype: string; size?: number },
  deps: { upload?: UploadListingImageFn; hostId?: string } = {}
): Promise<{ url: string; publicId: string }> {
  validateUploadFile(file);
  const upload = deps.upload ?? ((input) => defaultCloudinaryUpload(input, deps.hostId));
  try {
    const stored = await upload({ buffer: file.buffer, mimetype: file.mimetype });
    if (!stored.url || !stored.publicId) throw new Error("Cloudinary upload returned no asset");
    return stored;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, "We couldn't store that photo. Try again shortly.");
  }
}

export async function destroyListingImage(publicId: string, deps: { destroy?: DestroyListingImageFn } = {}) {
  if (!isManagedPublicId(publicId)) return;
  const destroy = deps.destroy ?? defaultCloudinaryDestroy;
  await destroy(publicId);
}

export async function saveLocalListingImage(file: { buffer: Buffer; mimetype: string; size?: number }) {
  validateUploadFile(file);
  const ext = ALLOWED_UPLOAD_TYPES[file.mimetype];
  const filename = `${crypto.randomBytes(8).toString("hex")}${ext}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), file.buffer);
  return { url: `/uploads/${filename}` } satisfies StoredListingImage;
}

export async function storeListingImage(
  file: { buffer?: Buffer; mimetype: string; size?: number },
  deps: { upload?: UploadListingImageFn; configured?: boolean; hostId?: string } = {}
): Promise<StoredListingImage> {
  validateUploadFile(file);
  const useCloud = Boolean(deps.upload) || (deps.configured ?? cloudinaryConfigured());
  if (!file.buffer) throw new ApiError(400, UPLOAD_ERROR_MESSAGE);
  if (useCloud) return uploadListingImage({ buffer: file.buffer, mimetype: file.mimetype, size: file.size }, deps);
  return saveLocalListingImage({ buffer: file.buffer, mimetype: file.mimetype, size: file.size });
}

export function removedCloudinaryPublicIds(
  previous: { publicId?: string; url?: string }[],
  next: { publicId?: string; url?: string }[]
): string[] {
  const keep = new Set(next.map((img) => img.publicId).filter((id): id is string => isManagedPublicId(id)));
  const removed: string[] = [];
  for (const img of previous) {
    if (!isManagedPublicId(img.publicId)) continue;
    if (!keep.has(img.publicId!)) removed.push(img.publicId!);
  }
  return removed;
}

/** Save listing rows first; only then destroy Cloudinary assets no longer referenced. */
export async function persistListingImages(
  previous: { url: string; publicId?: string }[],
  next: { url: string; publicId?: string }[],
  save: () => Promise<void>,
  deps: { destroy?: DestroyListingImageFn; hostId?: string } = {}
) {
  const images = deps.hostId ? sanitizeListingImages(deps.hostId, previous, next) : next;
  if (deps.hostId) {
    for (let i = 0; i < next.length; i++) {
      next[i]!.publicId = images[i]?.publicId ?? "";
    }
  }
  await save();
  const ids = removedCloudinaryPublicIds(previous, images).filter((id) => canDestroyPublicId(deps.hostId, id));
  for (const publicId of ids) {
    try {
      await destroyListingImage(publicId, deps);
    } catch (err) {
      console.error("[media] failed to destroy listing image");
      void err;
    }
  }
}
