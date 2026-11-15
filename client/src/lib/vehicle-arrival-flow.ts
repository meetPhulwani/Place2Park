export type ArrivalStep = "ask" | "warn" | "risk" | "code";

export function nextArrivalStep(step: ArrivalStep, action: "yes" | "no" | "back" | "continue" | "confirm"): ArrivalStep {
  if (step === "ask" && action === "yes") return "code";
  if (step === "ask" && action === "no") return "warn";
  if (step === "warn" && action === "back") return "ask";
  if (step === "warn" && action === "continue") return "risk";
  if (step === "risk" && action === "back") return "warn";
  if (step === "risk" && action === "confirm") return "code";
  return step;
}

export function plateMatchesQuestion(plate: string) {
  const shown = plate.trim() || "the registered vehicle";
  return `Does the arriving vehicle number match ${shown}?`;
}
