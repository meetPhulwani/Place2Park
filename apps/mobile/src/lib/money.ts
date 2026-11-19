/** Display an hourly price stored in paise. Does not calculate a booking total. */
export function formatHourlyPrice(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return "Price unavailable";
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  }).format(rupees);
  return `${formatted}/hr`;
}
