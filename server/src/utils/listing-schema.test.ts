import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listingSchema, type ListingInput } from "./validation.js";

function listing(images: ListingInput["images"]): ListingInput {
  return {
    title: "Covered stall near Juhu beach",
    description: "Host-owned covered parking",
    propertyType: "INDIVIDUAL",
    spaceType: "PRIVATE",
    covered: true,
    level: "GROUND",
    vehicleTypes: ["CAR"],
    evCharging: false,
    cctv: true,
    securityGuard: false,
    gated: true,
    address: "12 Juhu Tara Road",
    area: "Juhu",
    city: "Mumbai",
    latitude: 19.1076,
    longitude: 72.8263,
    accessInstructions: "",
    vehicleSizeNotes: "",
    overnightAllowed: false,
    selfParkingConfirmed: true,
    rules: [],
    pricePerHour: 5000,
    minDurationMins: 60,
    maxDurationMins: 1440,
    images,
    availability: [],
    blockedDates: [],
    publish: false,
  };
}

describe("listing image URL schema", () => {
  it("accepts demo and local upload paths used by existing listings", () => {
    const parsed = listingSchema.safeParse(
      listing([
        { url: "/demo/p1.svg", alt: "Demo stall" },
        { url: "/uploads/ab12cd34.jpg", alt: "Uploaded stall" },
      ])
    );
    assert.equal(parsed.success, true);
  });

  it("rejects an off-origin listing image URL", () => {
    const parsed = listingSchema.safeParse(listing([{ url: "https://evil.example/track.jpg", alt: "" }]));
    assert.equal(parsed.success, false);
  });
});
