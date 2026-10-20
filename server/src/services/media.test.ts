import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../middleware/error.js";
import {
  cloudinaryConfigured,
  persistListingImages,
  removedCloudinaryPublicIds,
  uploadListingImage,
} from "./media.js";

const jpeg = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  mimetype: "image/jpeg",
  size: 4,
};

describe("cloudinaryConfigured", () => {
  it("requires cloud name, api key, and api secret", () => {
    assert.equal(
      cloudinaryConfigured({
        CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "key",
        CLOUDINARY_API_SECRET: "secret",
      }),
      true
    );
    assert.equal(cloudinaryConfigured({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key" }), false);
    assert.equal(cloudinaryConfigured({}), false);
  });
});

describe("uploadListingImage", () => {
  it("returns a delivery URL and publicId from the Cloudinary uploader", async () => {
    const result = await uploadListingImage(jpeg, {
      upload: async () => ({
        url: "https://res.cloudinary.com/demo/image/upload/v1/place2park/listings/abc.jpg",
        publicId: "place2park/listings/abc",
      }),
    });
    assert.equal(result.url, "https://res.cloudinary.com/demo/image/upload/v1/place2park/listings/abc.jpg");
    assert.equal(result.publicId, "place2park/listings/abc");
  });

  it("rejects GIF and SVG even if a mock uploader is provided", async () => {
    const upload = async () => ({ url: "https://should-not.example/x", publicId: "x" });
    await assert.rejects(
      () => uploadListingImage({ buffer: Buffer.from("GIF89a"), mimetype: "image/gif", size: 6 }, { upload }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    await assert.rejects(
      () =>
        uploadListingImage(
          { buffer: Buffer.from("<svg/>"), mimetype: "image/svg+xml", size: 6 },
          { upload }
        ),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
  });

  it("surfaces Cloudinary failures as 503 without a stored URL", async () => {
    await assert.rejects(
      () =>
        uploadListingImage(jpeg, {
          upload: async () => {
            throw new Error("cloud down");
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 503
    );
  });
});

describe("listing image persistence vs cloud destroy", () => {
  it("does not destroy cloud assets when listing save fails", async () => {
    const destroyed: string[] = [];
    await assert.rejects(
      () =>
        persistListingImages(
          [{ url: "https://res.cloudinary.com/demo/image/upload/keep.jpg", publicId: "place2park/listings/keep" }],
          [],
          async () => {
            throw new ApiError(500, "Listing could not be saved.");
          },
          { destroy: async (id) => { destroyed.push(id); } }
        ),
      (err: unknown) => err instanceof ApiError && err.status === 500
    );
    assert.deepEqual(destroyed, []);
  });

  it("destroys only removed Cloudinary publicIds after a successful save", async () => {
    const destroyed: string[] = [];
    await persistListingImages(
      [
        { url: "https://res.cloudinary.com/demo/image/upload/old.jpg", publicId: "place2park/listings/old" },
        { url: "/uploads/legacy.jpg" },
        { url: "/demo/p1.svg" },
        { url: "https://res.cloudinary.com/demo/image/upload/keep.jpg", publicId: "place2park/listings/keep" },
      ],
      [
        { url: "https://res.cloudinary.com/demo/image/upload/keep.jpg", publicId: "place2park/listings/keep" },
        { url: "/uploads/legacy.jpg" },
      ],
      async () => undefined,
      { destroy: async (id) => { destroyed.push(id); } }
    );
    assert.deepEqual(destroyed, ["place2park/listings/old"]);
  });

  it("identifies removed Cloudinary ids and ignores local/demo paths", () => {
    assert.deepEqual(
      removedCloudinaryPublicIds(
        [
          { publicId: "place2park/listings/a" },
          { publicId: "place2park/listings/b" },
          { url: "/uploads/x.jpg" },
        ],
        [{ publicId: "place2park/listings/b" }]
      ),
      ["place2park/listings/a"]
    );
  });
});
