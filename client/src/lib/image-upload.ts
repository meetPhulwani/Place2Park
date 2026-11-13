/** Matches the API upload limit. Files over this size are refused before they leave the browser. */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_MESSAGE = "Upload a JPEG, PNG or WebP image up to 5 MB.";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function imageUploadError(file: File): string | null {
  const extension = file.name.toLowerCase().match(/\.(jpe?g|png|webp)$/);
  const typeOk = !file.type || IMAGE_TYPES.has(file.type);
  if (!typeOk || (!file.type && !extension) || file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return IMAGE_UPLOAD_MESSAGE;
  }
  return null;
}

export function acceptedImages(files: File[], limit = files.length) {
  const ok: File[] = [];
  let error: string | null = null;
  for (const file of files.slice(0, limit)) {
    const problem = imageUploadError(file);
    if (problem) error = problem;
    else ok.push(file);
  }
  return { ok, error };
}
