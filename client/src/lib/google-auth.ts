import { safeNextPath } from "./safe-next";

export const EMAIL_OTP_PENDING_KEY = "parkly_email_otp_pending";
export const EMAIL_OTP_META_KEY = "parkly_email_otp_meta";
export const GOOGLE_REGISTER_KEY = "parkly_google_register";
export const GOOGLE_REGISTER_META_KEY = "parkly_google_register_meta";

export type EmailOtpMeta = {
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  next: string;
  purpose: "signup" | "login";
};

export type EmailOtpChallenge = {
  pendingToken: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
};

export type GoogleRegistrationChallenge = {
  registrationToken: string;
  maskedEmail: string;
  expiresAt: string;
};

export type GoogleRegistrationMeta = {
  maskedEmail: string;
  expiresAt: string;
  next: string;
};

/** Registration or email verification never becomes a session, even if a token is also present. */
export function googleSignInResult<TUser>(data: {
  registrationRequired?: boolean;
  registrationToken?: string;
  emailVerificationRequired?: boolean;
  pendingToken?: string;
  maskedEmail?: string;
  expiresAt?: string;
  resendAvailableAt?: string;
  token?: string;
  user?: TUser;
}):
  | { kind: "registration"; registration: GoogleRegistrationChallenge }
  | { kind: "email"; challenge: EmailOtpChallenge }
  | { kind: "session"; token: string; user: TUser } {
  if (data.registrationRequired) {
    if (!data.registrationToken || !data.maskedEmail || !data.expiresAt) {
      throw new Error("Missing Google registration.");
    }
    return {
      kind: "registration",
      registration: {
        registrationToken: data.registrationToken,
        maskedEmail: data.maskedEmail,
        expiresAt: data.expiresAt,
      },
    };
  }
  if (data.emailVerificationRequired) {
    if (!data.pendingToken || !data.maskedEmail || !data.expiresAt || !data.resendAvailableAt) {
      throw new Error("Missing email verification token.");
    }
    return {
      kind: "email",
      challenge: {
        pendingToken: data.pendingToken,
        maskedEmail: data.maskedEmail,
        expiresAt: data.expiresAt,
        resendAvailableAt: data.resendAvailableAt,
      },
    };
  }
  if (!data.token || !data.user) throw new Error("Missing Google session.");
  return { kind: "session", token: data.token, user: data.user };
}

export function saveEmailOtpChallenge(
  challenge: EmailOtpChallenge,
  next?: string,
  purpose: EmailOtpMeta["purpose"] = "signup"
) {
  const meta: EmailOtpMeta = {
    maskedEmail: challenge.maskedEmail,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    next: safeNextPath(next),
    purpose,
  };
  sessionStorage.setItem(EMAIL_OTP_PENDING_KEY, challenge.pendingToken);
  sessionStorage.setItem(EMAIL_OTP_META_KEY, JSON.stringify(meta));
}

export function readEmailOtpChallenge(): { pendingToken: string; meta: EmailOtpMeta } | null {
  const pendingToken = sessionStorage.getItem(EMAIL_OTP_PENDING_KEY) ?? "";
  const raw = sessionStorage.getItem(EMAIL_OTP_META_KEY);
  if (!pendingToken || !raw) return null;
  try {
    const meta = JSON.parse(raw) as EmailOtpMeta;
    if (!meta.maskedEmail || !meta.expiresAt || !meta.resendAvailableAt) return null;
    return {
      pendingToken,
      meta: {
        ...meta,
        next: safeNextPath(meta.next),
        purpose: meta.purpose === "login" ? "login" : "signup",
      },
    };
  } catch {
    return null;
  }
}

export function clearEmailOtpChallenge() {
  sessionStorage.removeItem(EMAIL_OTP_PENDING_KEY);
  sessionStorage.removeItem(EMAIL_OTP_META_KEY);
}

export function saveGoogleRegistration(registration: GoogleRegistrationChallenge, next?: string) {
  const meta: GoogleRegistrationMeta = {
    maskedEmail: registration.maskedEmail,
    expiresAt: registration.expiresAt,
    next: safeNextPath(next),
  };
  sessionStorage.setItem(GOOGLE_REGISTER_KEY, registration.registrationToken);
  sessionStorage.setItem(GOOGLE_REGISTER_META_KEY, JSON.stringify(meta));
}

export function readGoogleRegistration(): { registrationToken: string; meta: GoogleRegistrationMeta } | null {
  const registrationToken = sessionStorage.getItem(GOOGLE_REGISTER_KEY) ?? "";
  const raw = sessionStorage.getItem(GOOGLE_REGISTER_META_KEY);
  if (!registrationToken || !raw) return null;
  try {
    const meta = JSON.parse(raw) as GoogleRegistrationMeta;
    if (!meta.maskedEmail || !meta.expiresAt) return null;
    return { registrationToken, meta: { ...meta, next: safeNextPath(meta.next) } };
  } catch {
    return null;
  }
}

export function clearGoogleRegistration() {
  sessionStorage.removeItem(GOOGLE_REGISTER_KEY);
  sessionStorage.removeItem(GOOGLE_REGISTER_META_KEY);
}
