import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spaceCoordinates } from "./space-coords.js";

describe("spaceCoordinates", () => {
  it("reads latitude/longitude from search summaries", () => {
    assert.deepEqual(spaceCoordinates({ latitude: 19.06, longitude: 72.83 }), {
      lat: 19.06,
      lng: 72.83,
    });
  });

  it("reads GeoJSON [lng, lat] from populated booking spaces", () => {
    assert.deepEqual(spaceCoordinates({ location: { coordinates: [72.83, 19.06] } }), {
      lat: 19.06,
      lng: 72.83,
    });
  });

  it("ignores missing or zeroed coordinates", () => {
    assert.equal(spaceCoordinates(null), null);
    assert.equal(spaceCoordinates({ latitude: 0, longitude: 0 }), null);
    assert.equal(spaceCoordinates({ location: { coordinates: [0, 0] } }), null);
  });
});
