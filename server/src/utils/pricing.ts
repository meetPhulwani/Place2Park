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
 */
export function computeQuote(pricePerHourPaise: number, durationMins: number): Quote {
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
