import type { AuthUser, EmailChallenge, GoogleRegistration } from "../types/auth";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "verify-email"; challenge: EmailChallenge }
  | { status: "google-role"; registration: GoogleRegistration }
  | { status: "signed-in"; user: AuthUser };

export function signedOut(): SessionState {
  return { status: "signed-out" };
}

export function withChallenge(challenge: EmailChallenge): SessionState {
  return { status: "verify-email", challenge };
}

export function signedIn(user: AuthUser): SessionState {
  return { status: "signed-in", user };
}

export function withGoogleRegistration(registration: GoogleRegistration): SessionState {
  return { status: "google-role", registration };
}

export async function restoreSession(deps: {
  readToken: () => Promise<string | null>;
  clearToken: () => Promise<void>;
  loadUser: (token: string) => Promise<AuthUser>;
}): Promise<SessionState> {
  const token = await deps.readToken();
  if (!token) return signedOut();
  try {
    return signedIn(await deps.loadUser(token));
  } catch {
    await deps.clearToken();
    return signedOut();
  }
}

let generation = 0;
let shared: { generation: number; promise: Promise<SessionState> } | null = null;

/** One in-flight restore for startup, including a React strict-mode remount. */
export function startupRestore(deps: Parameters<typeof restoreSession>[0]): Promise<SessionState> {
  if (!shared || shared.generation !== generation) {
    const current = generation;
    shared = { generation: current, promise: restoreSession(deps) };
  }
  return shared.promise;
}

export function invalidateStartup() {
  generation += 1;
  shared = null;
}

/** Clears this device only. Does not call the server revoke-all route. */
export async function logoutLocal(clearToken: () => Promise<void>): Promise<SessionState> {
  await clearToken();
  invalidateStartup();
  return signedOut();
}
