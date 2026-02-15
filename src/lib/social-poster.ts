import { extractProfileFromPost, type PlatformProfile } from "./social";
import { postActivationToBluesky, postRequestToBluesky } from "./bluesky";
import { logger } from "./logger";

export async function postActivation(
  proofUrl: string,
  displayName: string,
  profileUrl: string
): Promise<boolean> {
  const profile = extractProfileFromPost(proofUrl);
  
  if (!profile) {
    logger.warn("[social-poster] Could not extract platform from proof URL", { proofUrl });
    return false;
  }

  if (profile.platform === "bluesky") {
    return postActivationToBluesky(displayName, profileUrl);
  }

  logger.info("[social-poster] Skipping post for non-Bluesky platform", { platform: profile.platform });
  return false;
}

export async function postRequest(
  proofUrl: string,
  text: string,
  budgetMin: number | null,
  budgetMax: number | null,
  requestId: string
): Promise<boolean> {
  const profile = extractProfileFromPost(proofUrl);
  
  if (!profile) {
    logger.warn("[social-poster] Could not extract platform from proof URL", { proofUrl });
    return false;
  }

  if (profile.platform === "bluesky") {
    return postRequestToBluesky(text, budgetMin, budgetMax, requestId);
  }

  logger.info("[social-poster] Skipping request post for non-Bluesky platform", { platform: profile.platform });
  return false;
}
