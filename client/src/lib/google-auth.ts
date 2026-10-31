export const EMAIL_OTP_PENDING_KEY = "parkly_email_otp_pending";
export const EMAIL_OTP_META_KEY = "parkly_email_otp_meta";

export type EmailOtpMeta = {
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  next: string;
};

export type EmailOtpChallenge = {
  pendingToken: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
};

/** A verification challenge never becomes a session, even if a token is also present. */
export function googleSignInResult<TUser>(data: {
  emailVerificationRequired?: boolean;
  pendingToken?: string;
  maskedEmail?: string;
  expiresAt?: string;
  resendAvailableAt?: string;
  token?: string;
  user?: TUser;
}): { kind: "email"; challenge: EmailOtpChallenge } | { kind: "session"; token: string; user: TUser } {
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

export function saveEmailOtpChallenge(challenge: EmailOtpChallenge, next?: string) {
  const meta: EmailOtpMeta = {
    maskedEmail: challenge.maskedEmail,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    next: next && next.startsWith("/") ? next : "/dashboard",
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
    return { pendingToken, meta: { ...meta, next: meta.next?.startsWith("/") ? meta.next : "/dashboard" } };
  } catch {
    return null;
  }
}

export function clearEmailOtpChallenge() {
  sessionStorage.removeItem(EMAIL_OTP_PENDING_KEY);
  sessionStorage.removeItem(EMAIL_OTP_META_KEY);
}
