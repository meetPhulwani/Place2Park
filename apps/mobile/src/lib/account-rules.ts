export const PASSWORD_MESSAGE =
  "Use at least 8 characters with one uppercase letter, one number, and one special character.";

export const RESET_SENT_MESSAGE =
  "If an account exists for that email, we sent reset instructions. The message does not confirm that the address is registered.";

/** Same rule the API enforces in passwordIssue. */
export function passwordIssue(password: string): string | null {
  if (
    password.length < 8 ||
    password.length > 100 ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9\s]/.test(password)
  ) {
    return PASSWORD_MESSAGE;
  }
  return null;
}

export function emailIssue(email: string): string | null {
  const value = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) return "Enter a valid email.";
  return null;
}

/** Indian mobiles, stored as +91 and 10 digits starting 6-9. Matches the API. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  let local = digits;
  if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

export function phoneIssue(input: string): string | null {
  return normalizeIndianMobile(input) ? null : "Enter a valid 10-digit mobile number.";
}

export function loginIssues(email: string, password: string) {
  return {
    email: emailIssue(email),
    password: password.length === 0 ? "Enter your password." : password.length > 100 ? "Password must be 100 characters or fewer." : null,
  };
}

export function signupIssues(input: { name: string; email: string; password: string; phone: string }) {
  const name = input.name.trim();
  return {
    name: name.length >= 2 && name.length <= 80 ? null : "Enter your name.",
    email: emailIssue(input.email),
    password: passwordIssue(input.password),
    phone: phoneIssue(input.phone),
  };
}

export function resetIssues(token: string, password: string) {
  const trimmed = token.trim();
  return {
    token: trimmed.length >= 20 && trimmed.length <= 200 ? null : "Enter the reset token from the email.",
    password: passwordIssue(password),
  };
}
