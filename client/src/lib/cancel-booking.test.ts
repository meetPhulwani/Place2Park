import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AxiosError } from "axios";
import {
  CANCEL_REQUEST_TIMEOUT_MS,
  cancelSuccessMessage,
  isCancelTimeout,
  runCancelBooking,
} from "./cancel-booking.js";

describe("cancel booking UI", () => {
  it("clears the loading state after a successful cancellation", async () => {
    const busy: boolean[] = [];
    const result = await runCancelBooking({
      post: async () => ({ refunded: true, refundStatus: "PROCESSED" }),
      setBusy: (value) => busy.push(value),
      onSuccess: (message) => assert.equal(message, "Booking cancelled. Razorpay has confirmed the refund."),
      onError: () => assert.fail("should not error"),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(busy, [true, false]);
  });

  it("clears the loading state after a failed refund response", async () => {
    const busy: boolean[] = [];
    const errors: string[] = [];
    const result = await runCancelBooking({
      post: async () => {
        throw Object.assign(new AxiosError("We couldn't process the refund. Try again shortly."), {
          response: { data: { message: "We couldn't process the refund. Try again shortly." } },
        });
      },
      setBusy: (value) => busy.push(value),
      onSuccess: () => assert.fail("should not succeed"),
      onError: (message) => errors.push(message),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(busy, [true, false]);
    assert.match(errors[0] ?? "", /couldn't process the refund/i);
  });

  it("clears the loading state after a client timeout", async () => {
    const busy: boolean[] = [];
    const timeout = Object.assign(new AxiosError("timeout of 25000ms exceeded"), { code: "ECONNABORTED" });
    assert.equal(isCancelTimeout(timeout), true);
    assert.equal(CANCEL_REQUEST_TIMEOUT_MS, 25_000);
    const result = await runCancelBooking({
      post: async () => {
        throw timeout;
      },
      setBusy: (value) => busy.push(value),
      onSuccess: () => assert.fail("should not succeed"),
      onError: (message) => assert.match(message, /too long|timeout|reach the server|try again/i),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(busy, [true, false]);
  });

  it("describes pending refunds without calling them successful captures", () => {
    assert.equal(
      cancelSuccessMessage({ refunded: true, refundStatus: "PENDING" }),
      "Booking cancelled. A refund was requested — it can take a few days to appear."
    );
    assert.equal(cancelSuccessMessage({ refunded: false, refundStatus: null }), "Booking cancelled.");
  });
});
