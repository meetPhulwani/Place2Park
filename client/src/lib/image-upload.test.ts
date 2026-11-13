import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMAGE_UPLOAD_MESSAGE, MAX_IMAGE_UPLOAD_BYTES, acceptedImages, imageUploadError } from "./image-upload.ts";

function file(name: string, type: string, size: number) {
  return { name, type, size } as File;
}

describe("image upload limiter", () => {
  it("accepts a jpeg, png, or webp within 5 MB", () => {
    assert.equal(imageUploadError(file("slot.jpg", "image/jpeg", 1024)), null);
    assert.equal(imageUploadError(file("slot.png", "image/png", MAX_IMAGE_UPLOAD_BYTES)), null);
    assert.equal(imageUploadError(file("slot.webp", "image/webp", 2048)), null);
  });

  it("refuses a file over 5 MB, an empty file, and a non-image", () => {
    assert.equal(imageUploadError(file("big.jpg", "image/jpeg", MAX_IMAGE_UPLOAD_BYTES + 1)), IMAGE_UPLOAD_MESSAGE);
    assert.equal(imageUploadError(file("empty.png", "image/png", 0)), IMAGE_UPLOAD_MESSAGE);
    assert.equal(imageUploadError(file("note.pdf", "application/pdf", 100)), IMAGE_UPLOAD_MESSAGE);
    assert.equal(imageUploadError(file("photo.gif", "image/gif", 100)), IMAGE_UPLOAD_MESSAGE);
  });

  it("keeps the valid files and reports the one that is too large", () => {
    const result = acceptedImages(
      [file("ok.jpg", "image/jpeg", 100), file("huge.png", "image/png", MAX_IMAGE_UPLOAD_BYTES + 1)],
      4
    );
    assert.equal(result.ok.length, 1);
    assert.equal(result.ok[0]?.name, "ok.jpg");
    assert.equal(result.error, IMAGE_UPLOAD_MESSAGE);
  });
});
