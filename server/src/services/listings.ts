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

/** Production listings wait for admin review unless an administrator turns that requirement off. */
export function statusOnPublish(nodeEnv = env.NODE_ENV, requireReview?: boolean): ListingPublishState {
  const review = requireReview === undefined ? nodeEnv === "production" : requireReview;
  if (review) return { status: "PENDING_REVIEW", verified: false };
  return { status: "VERIFIED", verified: true };
}

export async function resolvePublishState(publish: boolean, nodeEnv = env.NODE_ENV): Promise<ListingPublishState> {
  if (!publish) return { status: "DRAFT", verified: false };
  const { PlatformSetting } = await import("../models/PlatformSetting.js");
  const row = await PlatformSetting.findOne({ key: "platform" }).select("listingsRequireReview").lean();
  if (!row) return statusOnPublish(nodeEnv);
  return statusOnPublish(nodeEnv, row.listingsRequireReview !== false);
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
