import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  completeGoogleSignUp,
  fetchCurrentUser,
  loginWithPassword,
  resendEmailCode,
  signupAccount,
  startGoogleSignIn,
  verifyEmailCode,
} from "../api/auth";
import { createApiClient } from "../api/client";
import { apiBaseUrl } from "../constants/env";
import { secureTokenStore } from "../lib/secure-storage";
import {
  logoutLocal,
  signedIn,
  signedOut,
  startupRestore,
  withChallenge,
  withGoogleRegistration,
  type SessionState,
} from "./session";
import type { EmailChallenge, SignupInput } from "../types/auth";

type AuthContextValue = {
  state: SessionState;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  continueWithGoogle: (idToken: string) => Promise<"email" | "registration">;
  completeGoogle: (role: SignupInput["role"]) => Promise<void>;
  verify: (otp: string) => Promise<void>;
  resend: () => Promise<EmailChallenge>;
  cancelChallenge: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function publicClient() {
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: async () => null });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    startupRestore({
      readToken: () => secureTokenStore.get(),
      clearToken: () => secureTokenStore.clear(),
      loadUser: async (token) => {
        const client = createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: async () => token });
        return fetchCurrentUser(client);
      },
    }).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async login(email, password) {
        const challenge = await loginWithPassword(publicClient(), email.trim(), password);
        setState(withChallenge(challenge));
      },
      async signup(input) {
        const challenge = await signupAccount(publicClient(), input);
        setState(withChallenge(challenge));
      },
      async continueWithGoogle(idToken) {
        const result = await startGoogleSignIn(publicClient(), idToken);
        if (result.kind === "email") {
          setState(withChallenge(result.challenge));
          return "email";
        }
        setState(withGoogleRegistration(result.registration));
        return "registration";
      },
      async completeGoogle(role) {
        if (state.status !== "google-role") throw new Error("Choose an account type to finish Google sign-in.");
        const session = await completeGoogleSignUp(publicClient(), state.registration.registrationToken, role);
        await secureTokenStore.set(session.token);
        setState(signedIn(session.user));
      },
      async verify(otp) {
        if (state.status !== "verify-email") throw new Error("Request a new code from the login screen.");
        const session = await verifyEmailCode(publicClient(), state.challenge.pendingToken, otp);
        await secureTokenStore.set(session.token);
        setState(signedIn(session.user));
      },
      async resend() {
        if (state.status !== "verify-email") throw new Error("Request a new code from the login screen.");
        const challenge = await resendEmailCode(publicClient(), state.challenge);
        setState(withChallenge(challenge));
        return challenge;
      },
      cancelChallenge() {
        setState(signedOut());
      },
      async logout() {
        setState(await logoutLocal(() => secureTokenStore.clear()));
      },
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
