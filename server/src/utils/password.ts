export const PASSWORD_MESSAGE =
  "Use at least 8 characters with one uppercase letter, one number, and one special character.";

/** Shared signup rule: length, uppercase, digit, and a non-space special character. */
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
