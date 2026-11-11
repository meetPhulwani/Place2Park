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
