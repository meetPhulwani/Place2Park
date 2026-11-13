import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicPaymentView, redactBooking } from "./privacy.js";

describe("booking privacy", () => {
  it("hides the access code until the booking is confirmed", () => {
    const pending = redactBooking({ status: "PENDING", accessCode: "1234" });
    assert.equal(pending.accessCode, "");
    const confirmed = redactBooking({ status: "CONFIRMED", accessCode: "1234" });
    assert.equal(confirmed.accessCode, "1234");
  });

  it("keeps a payer's payment id and withholds gateway ids from the other party", () => {
    const payment = {
      id: "paydoc",
      status: "PAID",
      amount: 5000,
      currency: "INR",
      orderId: "order_1",
      paymentId: "pay_1",
      refundId: "rfnd_1",
      method: "upi",
      signature: "secret",
    };
    const payer = publicPaymentView(payment, true);
    assert.equal(payer?.paymentId, "pay_1");
    assert.equal(payer?.signature, undefined);
    const host = publicPaymentView(payment, false);
    assert.equal(host?.status, "PAID");
    assert.equal(host?.amount, 5000);
    assert.equal(host?.paymentId, undefined);
    assert.equal(host?.orderId, undefined);
    assert.equal(host?.refundId, undefined);
    assert.equal(host?.method, undefined);
    assert.equal(host?.signature, undefined);
    assert.equal(publicPaymentView(null, false), null);
  });
});
