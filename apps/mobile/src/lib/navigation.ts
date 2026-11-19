import type { SessionState } from "../services/session";

/** Where the router should send this session. Loading has no screen yet. */
export function destinationFor(state: SessionState): string | null {
  switch (state.status) {
    case "loading":
      return null;
    case "signed-in":
      return "/(app)";
    case "verify-email":
      return "/(auth)/verify-email";
    case "google-role":
      return "/(auth)/google-role";
    default:
      return "/(auth)/login";
  }
}

export function canOpenProtectedApp(state: SessionState): boolean {
  return state.status === "signed-in";
}
