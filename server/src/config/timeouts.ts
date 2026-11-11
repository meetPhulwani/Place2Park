/** Central timeout budget. Environment overrides are optional positive integers. */

function intEnv(name: string, fallback: number, max: number) {
  const raw = Number(process.env[name]);
  if (!Number.isInteger(raw) || raw < 1 || raw > max) return fallback;
  return raw;
}

export const timeouts = {
  get requestMs() {
    return intEnv("REQUEST_TIMEOUT_MS", 30_000, 120_000);
  },
  /** Longer than a Razorpay refund so the handler can record an uncertain result. */
  get paymentRequestMs() {
    return intEnv("PAYMENT_REQUEST_TIMEOUT_MS", 50_000, 180_000);
  },
  get mongoServerSelectionMs() {
    return intEnv("MONGO_SERVER_SELECTION_TIMEOUT_MS", 10_000, 60_000);
  },
  get mongoConnectMs() {
    return intEnv("MONGO_CONNECT_TIMEOUT_MS", 10_000, 60_000);
  },
  get mongoSocketMs() {
    return intEnv("MONGO_SOCKET_TIMEOUT_MS", 45_000, 180_000);
  },
  get redisConnectMs() {
    return intEnv("REDIS_CONNECT_TIMEOUT_MS", 2_000, 30_000);
  },
  get redisCommandMs() {
    return intEnv("REDIS_COMMAND_TIMEOUT_MS", 2_000, 30_000);
  },
  get razorpayMs() {
    return intEnv("RAZORPAY_TIMEOUT_MS", 8_000, 60_000);
  },
  get razorpayRefundMs() {
    return intEnv("RAZORPAY_REFUND_TIMEOUT_MS", 20_000, 90_000);
  },
  get resendMs() {
    return intEnv("RESEND_TIMEOUT_MS", 10_000, 60_000);
  },
  get smtpMs() {
    return intEnv("SMTP_TIMEOUT_MS", 10_000, 60_000);
  },
  get googleMs() {
    return intEnv("GOOGLE_TIMEOUT_MS", 8_000, 30_000);
  },
  get cloudinaryMs() {
    return intEnv("CLOUDINARY_TIMEOUT_MS", 25_000, 120_000);
  },
  /** Reads may be retried. Charges, captures, and refunds may not. */
  get readAttempts() {
    return intEnv("READ_RETRY_ATTEMPTS", 2, 3);
  },
  get emailAttempts() {
    return intEnv("EMAIL_RETRY_ATTEMPTS", 2, 3);
  },
};

export function mongoConnectOptions() {
  return {
    serverSelectionTimeoutMS: timeouts.mongoServerSelectionMs,
    connectTimeoutMS: timeouts.mongoConnectMs,
    socketTimeoutMS: timeouts.mongoSocketMs,
  };
}
