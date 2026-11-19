export type AccountRole = "DRIVER" | "HOST" | "BOTH" | "ADMIN";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  status: string;
  phone?: string;
}

export interface EmailChallenge {
  purpose: "login" | "signup";
  pendingToken: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface GoogleRegistration {
  registrationToken: string;
  maskedEmail: string;
  expiresAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type GoogleStart =
  | { kind: "email"; challenge: EmailChallenge }
  | { kind: "registration"; registration: GoogleRegistration };

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: "DRIVER" | "HOST" | "BOTH";
}
