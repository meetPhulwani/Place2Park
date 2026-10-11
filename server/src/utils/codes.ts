/** Random human-friendly booking code, e.g. PK-7F3A2B */
export function bookingCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `PK-${s}`;
}

/** 6-digit access code. */
export function accessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
