import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminDirectoryPayoutFlags, User } from "./User.js";

function hostWithPayout() {
  return new User({
    name: "Host",
    email: "host@parkly.test",
    role: "HOST",
    payoutProfile: {
      accountHolder: "A K Sharma",
      ifsc: "HDFC0001234",
      accountLast4: "9876",
      accountFingerprint: "fingerprint-must-not-leak",
      accountNumberEnc: "iv:tag:cipher",
      verified: true,
    },
  });
}

describe("User public JSON", () => {
  it("omits payoutProfile and bank fields from toJSON used by auth/profile", () => {
    const json = hostWithPayout().toJSON() as Record<string, unknown>;
    assert.equal("payoutProfile" in json, false);
    assert.equal("accountHolder" in json, false);
    assert.equal("ifsc" in json, false);
    assert.equal("accountLast4" in json, false);
    assert.equal("accountFingerprint" in json, false);
    assert.equal("accountNumberEnc" in json, false);
    const blob = JSON.stringify(json);
    assert.equal(blob.includes("A K Sharma"), false);
    assert.equal(blob.includes("HDFC0001234"), false);
    assert.equal(blob.includes("fingerprint-must-not-leak"), false);
    assert.equal(blob.includes("iv:tag:cipher"), false);
  });

  it("exposes only submitted/verified flags for the admin user directory", () => {
    const user = hostWithPayout();
    const listed = {
      ...user.toJSON(),
      bookings: 2,
      listings: 1,
      ...adminDirectoryPayoutFlags(user),
    } as Record<string, unknown>;
    assert.equal(listed.payoutSubmitted, true);
    assert.equal(listed.payoutVerified, true);
    assert.equal("payoutProfile" in listed, false);
    const blob = JSON.stringify(listed);
    assert.equal(blob.includes("9876"), false);
    assert.equal(blob.includes("HDFC0001234"), false);
    assert.equal(blob.includes("A K Sharma"), false);
    assert.equal(blob.includes("fingerprint-must-not-leak"), false);
  });
});
