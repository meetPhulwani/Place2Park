import type { ApiClient } from "./client";
import { ApiRequestError } from "./client";
import type { AuthSession, AuthUser, EmailChallenge, GoogleRegistration, GoogleStart, SignupInput } from "../types/auth";

const ROLES = new Set(["DRIVER", "HOST", "BOTH", "ADMIN"]);

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new ApiRequestError(message, null);
  return value as Record<string, unknown>;
}

export function parseUser(value: unknown): AuthUser {
  const user = record(value, "The account response was incomplete.");
  const role = user.role;
  if (typeof user.id !== "string" || typeof user.name !== "string" || typeof user.email !== "string") {
    throw new ApiRequestError("The account response was incomplete.", null);
  }
  if (typeof role !== "string" || !ROLES.has(role)) throw new ApiRequestError("The account response was incomplete.", null);
  if (typeof user.status !== "string") throw new ApiRequestError("The account response was incomplete.", null);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: role as AuthUser["role"],
    status: user.status,
    phone: typeof user.phone === "string" ? user.phone : undefined,
  };
}

/** Login returns a challenge. A token in this payload is not a session. */
export function parseLoginChallenge(value: unknown): EmailChallenge {
  const data = record(value, "Sign-in did not return an email code challenge.");
  if (data.emailVerificationRequired !== true) {
    throw new ApiRequestError("Sign-in did not return an email code challenge.", null);
  }
  if (typeof data.pendingToken !== "string" || data.pendingToken.trim().length < 20) {
    throw new ApiRequestError("Sign-in did not return an email code challenge.", null);
  }
  if (typeof data.maskedEmail !== "string" || typeof data.expiresAt !== "string" || typeof data.resendAvailableAt !== "string") {
    throw new ApiRequestError("Sign-in did not return an email code challenge.", null);
  }
  return {
    pendingToken: data.pendingToken,
    maskedEmail: data.maskedEmail,
    expiresAt: data.expiresAt,
    resendAvailableAt: data.resendAvailableAt,
    purpose: "login",
  };
}

export function parseAuthSession(value: unknown): AuthSession {
  const data = record(value, "Verification did not return a session.");
  if (typeof data.token !== "string" || data.token.length < 20) {
    throw new ApiRequestError("Verification did not return a session.", null);
  }
  return { token: data.token, user: parseUser(data.user) };
}

function challengeFields(data: Record<string, unknown>, message: string) {
  if (typeof data.pendingToken !== "string" || data.pendingToken.trim().length < 20) {
    throw new ApiRequestError(message, null);
  }
  if (typeof data.maskedEmail !== "string" || typeof data.expiresAt !== "string" || typeof data.resendAvailableAt !== "string") {
    throw new ApiRequestError(message, null);
  }
  return {
    pendingToken: data.pendingToken,
    maskedEmail: data.maskedEmail,
    expiresAt: data.expiresAt,
    resendAvailableAt: data.resendAvailableAt,
  };
}

/** Signup returns the email challenge. A token in this payload is not a session. */
export function parseSignupChallenge(value: unknown): EmailChallenge {
  const data = record(value, "Signup did not return an email code challenge.");
  return { ...challengeFields(data, "Signup did not return an email code challenge."), purpose: "signup" };
}

/** Google start is either an email challenge or a role step. A token here is not a session. */
export function parseGoogleStart(value: unknown): GoogleStart {
  const data = record(value, "Google sign-in did not return a challenge.");
  if (data.registrationRequired === true) {
    if (typeof data.registrationToken !== "string" || data.registrationToken.length < 20) {
      throw new ApiRequestError("Google sign-in did not return a challenge.", null);
    }
    if (typeof data.maskedEmail !== "string" || typeof data.expiresAt !== "string") {
      throw new ApiRequestError("Google sign-in did not return a challenge.", null);
    }
    const registration: GoogleRegistration = {
      registrationToken: data.registrationToken,
      maskedEmail: data.maskedEmail,
      expiresAt: data.expiresAt,
    };
    return { kind: "registration", registration };
  }
  if (data.emailVerificationRequired !== true) {
    throw new ApiRequestError("Google sign-in did not return a challenge.", null);
  }
  return { kind: "email", challenge: { ...challengeFields(data, "Google sign-in did not return a challenge."), purpose: "login" } };
}

export function parseResend(value: unknown, current: Pick<EmailChallenge, "pendingToken" | "purpose">): EmailChallenge {
  const data = record(value, "A new code could not be requested.");
  if (typeof data.pendingToken === "string" && data.pendingToken !== current.pendingToken) {
    throw new ApiRequestError("A new code could not be requested.", null);
  }
  if (typeof data.maskedEmail !== "string" || typeof data.expiresAt !== "string" || typeof data.resendAvailableAt !== "string") {
    throw new ApiRequestError("A new code could not be requested.", null);
  }
  return {
    pendingToken: current.pendingToken,
    maskedEmail: data.maskedEmail,
    expiresAt: data.expiresAt,
    resendAvailableAt: data.resendAvailableAt,
    purpose: current.purpose,
  };
}

export async function loginWithPassword(client: ApiClient, email: string, password: string) {
  const data = await client.request<unknown>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  return parseLoginChallenge(data);
}

export async function verifyEmailCode(client: ApiClient, pendingToken: string, otp: string) {
  const data = await client.request<unknown>("/auth/email-otp/verify", {
    method: "POST",
    auth: false,
    body: { pendingToken, otp },
  });
  return parseAuthSession(data);
}

export async function resendEmailCode(client: ApiClient, current: Pick<EmailChallenge, "pendingToken" | "purpose">) {
  const data = await client.request<unknown>("/auth/email-otp/resend", {
    method: "POST",
    auth: false,
    body: { pendingToken: current.pendingToken },
  });
  return parseResend(data, current);
}

export async function signupAccount(client: ApiClient, input: SignupInput) {
  const data = await client.request<unknown>("/auth/signup", {
    method: "POST",
    auth: false,
    body: input,
  });
  return parseSignupChallenge(data);
}

export async function startGoogleSignIn(client: ApiClient, credential: string) {
  const data = await client.request<unknown>("/auth/google", {
    method: "POST",
    auth: false,
    body: { credential },
  });
  return parseGoogleStart(data);
}

export async function completeGoogleSignUp(client: ApiClient, registrationToken: string, role: SignupInput["role"]) {
  const data = await client.request<unknown>("/auth/google/complete", {
    method: "POST",
    auth: false,
    body: { registrationToken, role },
  });
  return parseAuthSession(data);
}

export async function requestPasswordReset(client: ApiClient, email: string) {
  await client.request<unknown>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function submitPasswordReset(client: ApiClient, token: string, password: string) {
  await client.request<unknown>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, password },
  });
}

export async function fetchCurrentUser(client: ApiClient) {
  const data = await client.request<{ user?: unknown }>("/auth/me", { auth: true });
  return parseUser(data.user);
}
