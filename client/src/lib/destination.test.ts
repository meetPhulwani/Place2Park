import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { haversineKm } from "./geo.js";
import {
  destinationPan,
  frameDestinationView,
  knownDestination,
  occlusionFromRects,
  resolveDestinationQuery,
  straightLineLabel,
  viewportPoints,
} from "./destination.js";

describe("straightLineLabel", () => {
  it("formats sub-kilometre distances in metres", () => {
    assert.equal(straightLineLabel(0.45), "450 m straight line");
  });

  it("formats longer distances in kilometres", () => {
    assert.equal(straightLineLabel(1.24), "1.2 km straight line");
    assert.equal(straightLineLabel(3.5), "3.5 km straight line");
  });

  it("does not invent a distance when coordinates are missing", () => {
    assert.equal(straightLineLabel(null), null);
    assert.equal(straightLineLabel(Number.NaN), null);
  });
});

describe("knownDestination", () => {
  it("resolves Andheri West from the existing locality catalog", () => {
    const place = knownDestination("Andheri West");
    assert.ok(place);
    assert.equal(place?.label, "Andheri West");
    assert.ok(Math.abs((place?.latitude ?? 0) - 19.1364) < 0.001);
    assert.ok(Math.abs((place?.longitude ?? 0) - 72.8296) < 0.001);
  });

  it("returns null for an unknown place instead of a fallback city", () => {
    assert.equal(knownDestination("Atlantis Resort"), null);
    assert.equal(knownDestination("  "), null);
  });
});

describe("resolveDestinationQuery", () => {
  it("uses the geocoder result instead of a catalog coordinate", async () => {
    const place = await resolveDestinationQuery("Andheri West", async () => ({
      latitude: 19.13632,
      longitude: 72.82966,
      label: "Andheri West, Mumbai, Maharashtra",
    }));
    assert.equal(place?.label, "Andheri West, Mumbai, Maharashtra");
    assert.equal(place?.latitude, 19.13632);
  });

  it("falls back to the locality catalog when geocoding finds nothing", async () => {
    const place = await resolveDestinationQuery("andheri west", async () => null);
    assert.equal(place?.label, "Andheri West");
    assert.ok(place);
  });

  it("returns null when neither geocoding nor the catalog can place it", async () => {
    assert.equal(await resolveDestinationQuery("Atlantis Resort", async () => null), null);
  });
});

describe("viewportPoints", () => {
  it("keeps the destination and every parking marker in the same view", () => {
    const destination = { lat: 19.1364, lng: 72.8296 };
    const markers = [
      { lat: 19.1197, lng: 72.8464 },
      { lat: 19.1075, lng: 72.8263 },
    ];
    const points = viewportPoints(destination, markers);
    assert.equal(points.length, 3);
    assert.deepEqual(points[2], destination);
  });

  it("drops invalid marker coordinates without dropping the destination", () => {
    const destination = { lat: 19.1364, lng: 72.8296 };
    const points = viewportPoints(destination, [{ lat: Number.NaN, lng: 72.8 }]);
    assert.deepEqual(points, [destination]);
  });
});

describe("occlusionFromRects", () => {
  it("shifts the pin right of a left-hand results card", () => {
    const occlusion = occlusionFromRects(
      { left: 0, top: 0, right: 1280, bottom: 735 },
      { left: 12, top: 12, right: 452, bottom: 723 }
    );
    assert.ok(occlusion.left > 440);
    assert.equal(occlusion.bottom, 0);
    const pan = destinationPan(1280, 735, occlusion);
    assert.ok(pan.x < -80);
  });

  it("shifts the pin above a bottom results sheet", () => {
    const occlusion = occlusionFromRects(
      { left: 0, top: 0, right: 412, bottom: 858 },
      { left: 0, top: 326, right: 412, bottom: 858 }
    );
    assert.equal(occlusion.left, 0);
    assert.ok(occlusion.bottom > 400);
    const pan = destinationPan(412, 858, occlusion);
    assert.ok(pan.y > 150);
  });
});

describe("frameDestinationView", () => {
  const andheri = { lat: 19.1364, lng: 72.8296 };

  it("centres an empty neighbourhood at zoom 15", () => {
    const frame = frameDestinationView(andheri, [], 900);
    assert.deepEqual(frame.center, andheri);
    assert.equal(frame.zoom, 15);
    assert.deepEqual(frame.points, [andheri]);
  });

  it("stays at street zoom when a space is on the same block", () => {
    const close = { lat: 19.138, lng: 72.831 };
    const frame = frameDestinationView(andheri, [close], 800);
    assert.equal(frame.center.lat, andheri.lat);
    assert.ok(frame.zoom >= 15 && frame.zoom <= 16);
    assert.equal(frame.points.length, 2);
  });

  it("ignores a distant space so the camera does not open at city scale", () => {
    const close = { lat: 19.14, lng: 72.834 };
    const malad = { lat: 19.1864, lng: 72.8402 };
    const frame = frameDestinationView(andheri, [close, malad], 900);
    assert.ok(frame.zoom >= 15 && frame.zoom <= 16);
    assert.equal(frame.points.some((point) => point.lat === malad.lat), false);
    assert.equal(frame.points.some((point) => point.lat === close.lat), true);
  });

  it("widens only enough to keep the closest space when it sits past zoom 15", () => {
    const farther = { lat: 19.15, lng: 72.84 };
    const frame = frameDestinationView(andheri, [farther], 360);
    const km = haversineKm(andheri.lat, andheri.lng, farther.lat, farther.lng);
    assert.ok(km > 1 && km <= 2.2);
    assert.ok(frame.zoom >= 14 && frame.zoom < 15);
    assert.equal(frame.points.length, 2);
  });
});

describe("haversineKm", () => {
  it("measures a straight line instead of a constant", () => {
    const km = haversineKm(19.1364, 72.8296, 19.1197, 72.8464);
    assert.ok(km > 2 && km < 3, `expected about 2.5 km, got ${km}`);
    assert.equal(haversineKm(19.1364, 72.8296, 19.1364, 72.8296), 0);
  });
});
