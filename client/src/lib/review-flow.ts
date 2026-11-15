export const REVIEW_SKIP_LIMIT = 3;
export const RISK_ACKNOWLEDGEMENT = "I ACCEPT THE RISK";

export function reviewPrompt(role: "DRIVER" | "HOST") {
  return role === "HOST" ? "How was your experience with this driver?" : "How was your parking experience?";
}

export function reviewCategories(role: "DRIVER" | "HOST") {
  if (role === "HOST") {
    return [
      { key: "punctuality", label: "Punctuality" },
      { key: "respect", label: "Respect for the space" },
    ];
  }
  return [
    { key: "access", label: "Ease of access" },
    { key: "safety", label: "Safety" },
    { key: "value", label: "Value" },
  ];
}

export function canSkipReview(skipCount: number, limit = REVIEW_SKIP_LIMIT) {
  return skipCount < limit;
}

export function reviewGateMessage(blocked: boolean) {
  return blocked ? "Submit your pending review before you book again or check another driver in." : "";
}
