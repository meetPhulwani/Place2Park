/** Indian mobile numbers, stored as E.164 `+91XXXXXXXXXX`. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  let local = digits;
  if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}
