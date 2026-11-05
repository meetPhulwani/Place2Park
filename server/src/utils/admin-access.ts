export const ADMIN_ROLES = ["SUPER_ADMIN", "OPERATIONS", "SUPPORT", "FINANCE"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const SECURITY_QUESTIONS = [
  { id: "first-school", text: "What was the name of your first school?" },
  { id: "city-born", text: "In which city were you born?" },
  { id: "first-car", text: "What was the make of your first car?" },
  { id: "favorite-teacher", text: "What was the last name of your favorite teacher?" },
  { id: "childhood-street", text: "What street did you live on as a child?" },
] as const;

export type SecurityQuestionId = (typeof SECURITY_QUESTIONS)[number]["id"];

const ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  SUPER_ADMIN: ["*"],
  OPERATIONS: [
    "overview.read",
    "users.read",
    "users.status",
    "hosts.verify",
    "listings.read",
    "listings.moderate",
    "bookings.read",
    "bookings.cancel",
    "reviews.read",
  ],
  SUPPORT: [
    "overview.read",
    "users.read",
    "reports.read",
    "reports.resolve",
    "support.read",
    "support.write",
    "faqs.read",
    "faqs.write",
    "reviews.read",
  ],
  FINANCE: [
    "overview.read",
    "users.read",
    "payments.read",
    "payouts.read",
    "payouts.write",
    "payouts.reveal",
  ],
};

export function questionText(id: string) {
  return SECURITY_QUESTIONS.find((item) => item.id === id)?.text ?? null;
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: AdminRole, permission: string) {
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes("*") || granted.includes(permission);
}

export function normalizeSecurityAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
