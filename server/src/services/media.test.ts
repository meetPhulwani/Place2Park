import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../middleware/error.js";
import {
  cloudinaryConfigured,
  isAllowedListingImageUrl,
  persistListingImages,
  removedCloudinaryPublicIds,
  sanitizeListingImages,
  uploadListingImage,
  validateUploadFile,
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

  it("does not keep or destroy another host's Cloudinary publicId", async () => {
    const hostA = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const hostB = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const stolen = `place2park/listings/${hostA}/secret`;
    const destroyed: string[] = [];
    const incoming = [
      { url: "https://res.cloudinary.com/demo/image/upload/stolen.jpg", publicId: stolen },
    ];
    const sanitized = sanitizeListingImages(hostB, [], incoming);
    assert.equal(sanitized[0]?.publicId, "");
    await persistListingImages([], incoming, async () => undefined, {
      hostId: hostB,
      destroy: async (id) => {
        destroyed.push(id);
      },
    });
    assert.equal(incoming[0]?.publicId, "");
    assert.deepEqual(destroyed, []);
  });

  it("lets a host remove an image that already belongs to their listing", async () => {
    const hostA = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const own = `place2park/listings/${hostA}/mine`;
    const destroyed: string[] = [];
    await persistListingImages(
      [{ url: "https://res.cloudinary.com/demo/image/upload/mine.jpg", publicId: own }],
      [],
      async () => undefined,
      { hostId: hostA, destroy: async (id) => { destroyed.push(id); } }
    );
    assert.deepEqual(destroyed, [own]);
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

describe("upload magic-byte validation", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x0c, 0, 0, 0]), Buffer.from("WEBP")]);
  const gif = Buffer.from("GIF89aXXXXXXXX");

  it("accepts JPEG, PNG, and WebP signatures that match the declared MIME type", () => {
    assert.doesNotThrow(() => validateUploadFile(jpeg));
    assert.doesNotThrow(() => validateUploadFile({ buffer: png, mimetype: "image/png", size: png.length }));
    assert.doesNotThrow(() => validateUploadFile({ buffer: webp, mimetype: "image/webp", size: webp.length }));
  });

  it("rejects a GIF labeled as JPEG", () => {
    assert.throws(
      () => validateUploadFile({ buffer: gif, mimetype: "image/jpeg", size: gif.length }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
  });
});

describe("listing image URL allowlist", () => {
  const opts = { cloudName: "demo" };

  it("allows demo, upload, and configured Cloudinary delivery URLs", () => {
    assert.equal(isAllowedListingImageUrl("/demo/p1.svg", opts), true);
    assert.equal(isAllowedListingImageUrl("/uploads/ab12cd34.jpg", opts), true);
    assert.equal(
      isAllowedListingImageUrl("https://res.cloudinary.com/demo/image/upload/v1/place2park/listings/abc.jpg", opts),
      true
    );
  });

  it("rejects off-origin, traversal, and non-https image URLs", () => {
    assert.equal(isAllowedListingImageUrl("https://evil.example/track.jpg", opts), false);
    assert.equal(isAllowedListingImageUrl("https://res.cloudinary.com/other/image/upload/v1/x.jpg", opts), false);
    assert.equal(isAllowedListingImageUrl("http://res.cloudinary.com/demo/image/upload/v1/x.jpg", opts), false);
    assert.equal(isAllowedListingImageUrl("javascript:alert(1)", opts), false);
    assert.equal(isAllowedListingImageUrl("/uploads/../secret.jpg", opts), false);
    assert.equal(isAllowedListingImageUrl("/demo/nested/path.svg", opts), false);
  });

  it("drops disallowed URLs when sanitizing a listing save", () => {
    const host = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const sanitized = sanitizeListingImages(host, [], [
      { url: "https://evil.example/track.jpg" },
      { url: "/demo/p1.svg" },
    ]);
    assert.equal(sanitized[0]?.url, "");
    assert.equal(sanitized[1]?.url, "/demo/p1.svg");
  });
});
