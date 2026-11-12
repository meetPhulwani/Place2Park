export const DELETE_CONFIRMATION = "CONFIRM";

export function confirmationMatches(value: string) {
  return value === DELETE_CONFIRMATION;
}

export function shouldBlockConfirmClipboard(kind: "paste" | "cut" | "drop" | "copy" | "input") {
  return kind === "paste" || kind === "cut" || kind === "drop";
}

export function shouldBlockConfirmShortcut(event: { ctrlKey?: boolean; metaKey?: boolean; key: string }) {
  return Boolean(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
}

/** One deletion request at a time. A second click while the first is running is ignored. */
export function claimDeletionSubmit(state: { current: boolean }) {
  if (state.current) return false;
  state.current = true;
  return true;
}

export function releaseDeletionSubmit(state: { current: boolean }) {
  state.current = false;
}

/**
 * A 409 is the server refusing deletion for a reason the user can act on.
 * The explanation is the response message, not a generic application failure.
 */
export function deletionOutcome(status: number | null, serverMessage: string | undefined, fallback: string) {
  const message = serverMessage?.trim() || fallback;
  if (status === 409) return { kind: "blocked" as const, retry: false as const, message };
  if (status === 429) {
    return {
      kind: "limited" as const,
      retry: false as const,
      message: "Too many deletion attempts. Wait 15 minutes before trying again. The account was not deleted.",
    };
  }
  return { kind: "failed" as const, retry: false as const, message };
}
