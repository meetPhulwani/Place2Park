import { ApiError } from "../middleware/error.js";
import { env } from "../config/env.js";

export type ListingPublishState = {
  status: "DRAFT" | "PENDING_REVIEW" | "VERIFIED";
  verified: boolean;
};

export type ListingModerationAction = "approve" | "reject" | "hide" | "unhide";

export type ListingModerationPatch = {
  status: "VERIFIED" | "REJECTED" | "HIDDEN";
  verified?: boolean;
};

/** Production listings wait for admin review. Local/dev auto-verifies so the host→book path is testable. */
export function statusOnPublish(nodeEnv = env.NODE_ENV): ListingPublishState {
  if (nodeEnv === "production") return { status: "PENDING_REVIEW", verified: false };
  return { status: "VERIFIED", verified: true };
}

export function listingCreateState(publish: boolean, nodeEnv = env.NODE_ENV): ListingPublishState {
  if (!publish) return { status: "DRAFT", verified: false };
  return statusOnPublish(nodeEnv);
}

export function applyListingModeration(action: string): ListingModerationPatch {
  const map: Record<ListingModerationAction, ListingModerationPatch> = {
    approve: { status: "VERIFIED", verified: true },
    reject: { status: "REJECTED", verified: false },
    hide: { status: "HIDDEN" },
    unhide: { status: "VERIFIED", verified: true },
  };
  const patch = map[action as ListingModerationAction];
  if (!patch) throw new ApiError(400, "Invalid action.");
  return patch;
}
