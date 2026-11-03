import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_MAP_CENTER,
  FALLBACK_MAP_ZOOM,
  cameraForPermission,
  shouldHoldMapCamera,
} from "./map-camera.js";

const kalyan = { lat: 19.2403, lng: 73.1305 };

describe("home map camera", () => {
  it("uses one fallback center and zoom when location is not granted", () => {
    assert.equal(FALLBACK_MAP_ZOOM, 13);
    assert.deepEqual(cameraForPermission("prompt", kalyan), FALLBACK_MAP_CENTER);
    assert.deepEqual(cameraForPermission("denied", kalyan), FALLBACK_MAP_CENTER);
    assert.deepEqual(cameraForPermission("unknown", kalyan), FALLBACK_MAP_CENTER);
    assert.deepEqual(cameraForPermission("granted", null), FALLBACK_MAP_CENTER);
  });

  it("uses a granted device fix and does not replace it with the fallback", () => {
    assert.deepEqual(cameraForPermission("granted", kalyan), kalyan);
  });

  it("holds a centred map instead of fitting every marker", () => {
    assert.equal(shouldHoldMapCamera(false, true), true);
    assert.equal(shouldHoldMapCamera(true, true), false);
    assert.equal(shouldHoldMapCamera(false, false), false);
  });
});
