import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { UPLOAD_ERROR_MESSAGE, storeListingImage } from "../services/media.js";

/** Host listing photo. Cloudinary when configured; local /uploads in development otherwise. */
export async function uploadImage(req: AuthedRequest, res: Response) {
  const file = req.file;
  if (!file?.buffer) throw new ApiError(400, UPLOAD_ERROR_MESSAGE);
  const stored = await storeListingImage({
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
  });
  res.json({
    success: true,
    data: {
      url: stored.url,
      ...(stored.publicId ? { publicId: stored.publicId } : {}),
    },
  });
}
