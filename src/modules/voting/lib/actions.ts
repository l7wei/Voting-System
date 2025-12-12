"use server";

/**
 * Server Actions for Voting Module
 * These actions handle voting-related operations using Firestore
 */

import {
  getCampaigns as getFirestoreCampaigns,
  getActiveCampaigns as getFirestoreActiveCampaigns,
  getCampaignById as getFirestoreCampaignById,
  createCampaign as createFirestoreCampaign,
  updateCampaign as updateFirestoreCampaign,
  deleteCampaign as deleteFirestoreCampaign,
  hasUserVoted as checkUserVoted,
  submitVote as submitFirestoreVote,
  getCampaignStatistics as getFirestoreStatistics,
} from "@/src/modules/shared/lib/voting-service";
import {
  FirestoreVotingCampaign,
  ChoiceAllVote,
} from "@/src/modules/shared/types/firestore";
import { getUserByUid } from "@/src/modules/shared/lib/user-service";
import { cookies } from "next/headers";

/**
 * Get current user from session
 * 
 * IMPLEMENTATION NOTE:
 * This function needs to be completed in Phase 3 (Authentication Integration).
 * 
 * The proper implementation should:
 * 1. Get the session cookie from the request
 * 2. Verify it using Firebase Auth's verifySessionCookie()
 * 3. Extract the UID from the decoded token
 * 4. Fetch the user from Firestore using getUserByUid()
 * 
 * Example implementation:
 * ```typescript
 * const sessionCookie = cookies().get("session")?.value;
 * if (!sessionCookie) return null;
 * 
 * try {
 *   const decodedToken = await firebaseAuth.verifySessionCookie(sessionCookie, true);
 *   return await getUserByUid(decodedToken.uid);
 * } catch (error) {
 *   console.error("Session verification failed:", error);
 *   return null;
 * }
 * ```
 * 
 * SECURITY IMPACT:
 * Until this is implemented, all Server Actions in this module that require
 * authentication will fail. This is intentional to prevent unauthorized access.
 * The application should use the legacy auth system (JWT) until migration is complete.
 */
async function getCurrentUser() {
  // TODO: Implement proper session verification in Phase 3
  // For now, this returns null to prevent unauthorized access
  const sessionCookie = cookies().get("session");
  if (!sessionCookie) {
    return null;
  }

  // Placeholder - will be implemented in Phase 3
  // const decodedToken = await firebaseAuth.verifySessionCookie(sessionCookie.value);
  // return getUserByUid(decodedToken.uid);

  return null;
}

/**
 * Get all campaigns
 */
export async function getCampaigns(): Promise<FirestoreVotingCampaign[]> {
  try {
    return await getFirestoreCampaigns();
  } catch (error) {
    console.error("Error in getCampaigns action:", error);
    throw new Error("Failed to fetch campaigns");
  }
}

/**
 * Get active campaigns
 */
export async function getActiveCampaigns(): Promise<
  FirestoreVotingCampaign[]
> {
  try {
    return await getFirestoreActiveCampaigns();
  } catch (error) {
    console.error("Error in getActiveCampaigns action:", error);
    throw new Error("Failed to fetch active campaigns");
  }
}

/**
 * Get campaign by ID
 */
export async function getCampaignById(
  campaignId: string
): Promise<FirestoreVotingCampaign | null> {
  try {
    return await getFirestoreCampaignById(campaignId);
  } catch (error) {
    console.error("Error in getCampaignById action:", error);
    throw new Error("Failed to fetch campaign");
  }
}

/**
 * Create a new campaign (admin only)
 */
export async function createCampaign(
  campaign: Omit<FirestoreVotingCampaign, "id" | "created_at" | "updated_at">
): Promise<FirestoreVotingCampaign> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.roles.admin) {
      throw new Error("Unauthorized: Admin access required");
    }

    return await createFirestoreCampaign({
      ...campaign,
      created_by: user.uid,
    });
  } catch (error) {
    console.error("Error in createCampaign action:", error);
    throw error;
  }
}

/**
 * Update a campaign (admin only)
 */
export async function updateCampaign(
  campaignId: string,
  updates: Partial<Omit<FirestoreVotingCampaign, "id" | "created_at">>
): Promise<FirestoreVotingCampaign> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.roles.admin) {
      throw new Error("Unauthorized: Admin access required");
    }

    return await updateFirestoreCampaign(campaignId, updates);
  } catch (error) {
    console.error("Error in updateCampaign action:", error);
    throw error;
  }
}

/**
 * Delete a campaign (admin only)
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.roles.admin) {
      throw new Error("Unauthorized: Admin access required");
    }

    await deleteFirestoreCampaign(campaignId);
  } catch (error) {
    console.error("Error in deleteCampaign action:", error);
    throw error;
  }
}

/**
 * Check if current user has voted in a campaign
 */
export async function hasVoted(campaignId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.student_id) {
      throw new Error("Unauthorized: Student account required");
    }

    return await checkUserVoted(campaignId, user.student_id);
  } catch (error) {
    console.error("Error in hasVoted action:", error);
    throw error;
  }
}

/**
 * Submit a vote
 */
export async function submitVote(
  campaignId: string,
  rule: "choose_all" | "choose_one",
  vote: ChoiceAllVote[] | string
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.student_id) {
      throw new Error("Unauthorized: Student account required");
    }

    if (!user.inschool) {
      throw new Error("Unauthorized: Only current students can vote");
    }

    await submitFirestoreVote(campaignId, user.student_id, rule, vote);

    return {
      success: true,
      message: "Vote submitted successfully",
    };
  } catch (error) {
    console.error("Error in submitVote action:", error);
    if (error instanceof Error) {
      return {
        success: false,
        message: error.message,
      };
    }
    return {
      success: false,
      message: "Failed to submit vote",
    };
  }
}

/**
 * Get campaign statistics (admin only)
 */
export async function getCampaignStatistics(campaignId: string): Promise<{
  total_votes: number;
  participation_rate: number;
  results: {
    option_id: string;
    support: number;
    oppose: number;
    neutral: number;
    total: number;
  }[];
}> {
  try {
    const user = await getCurrentUser();

    if (!user || !user.roles.admin) {
      throw new Error("Unauthorized: Admin access required");
    }

    return await getFirestoreStatistics(campaignId);
  } catch (error) {
    console.error("Error in getCampaignStatistics action:", error);
    throw error;
  }
}
