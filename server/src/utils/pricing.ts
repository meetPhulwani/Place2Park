import { PLATFORM_FEE_PCT, SERVICE_FEE_PCT } from "./constants.js";

export interface Quote {
  durationMins: number;
  baseAmount: number; // paise
  serviceFee: number;
  totalAmount: number;
  platformFee: number;
  hostEarning: number;
}

/**
 * Single source of truth for money math. All amounts in paise.
 * Never accept computed prices from the client.
 *
 * New bookings only. Stored Booking.totalAmount / hostEarning / platformFee /
 * serviceFee are historical records and must not be rewritten from this helper.
 */
export function computeQuote(pricePerHourPaise: number, durationMins: number): Quote {
  if (!Number.isFinite(pricePerHourPaise) || pricePerHourPaise < 0) {
    throw new Error("Price must be a non-negative finite amount in paise.");
  }
  if (!Number.isFinite(durationMins) || durationMins <= 0) {
    throw new Error("Duration must be a positive finite number of minutes.");
  }
  const baseAmount = Math.round((pricePerHourPaise * durationMins) / 60);
  const serviceFee = Math.round((baseAmount * SERVICE_FEE_PCT) / 100);
  const platformFee = Math.round((baseAmount * PLATFORM_FEE_PCT) / 100);
  return {
    durationMins,
    baseAmount,
    serviceFee,
    totalAmount: baseAmount + serviceFee,
    platformFee,
    hostEarning: baseAmount - platformFee,
  };
}
