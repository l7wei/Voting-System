import "server-only";
import { firestore } from "./firebase-admin";
import {
  FirestoreVotingCampaign,
  FirestoreVotingBallot,
  VotingOption,
  ChoiceAllVote,
} from "../types/firestore";
import { v4 as uuidv4 } from "uuid";

/**
 * Voting Service
 * Handles all voting-related operations with Firestore
 */

const CAMPAIGNS_COLLECTION = "modules_voting_campaigns";
const BALLOTS_COLLECTION = "modules_voting_ballots";

/**
 * Get all campaigns
 */
export async function getCampaigns(): Promise<FirestoreVotingCampaign[]> {
  try {
    const snapshot = await firestore
      .collection(CAMPAIGNS_COLLECTION)
      .orderBy("created_at", "desc")
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FirestoreVotingCampaign[];
  } catch (error) {
    console.error("Error getting campaigns:", error);
    throw error;
  }
}

/**
 * Get active campaigns (currently open)
 */
export async function getActiveCampaigns(): Promise<
  FirestoreVotingCampaign[]
> {
  try {
    const now = new Date();
    const snapshot = await firestore
      .collection(CAMPAIGNS_COLLECTION)
      .where("open_from", "<=", now)
      .where("open_to", ">=", now)
      .orderBy("open_from", "desc")
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FirestoreVotingCampaign[];
  } catch (error) {
    console.error("Error getting active campaigns:", error);
    throw error;
  }
}

/**
 * Get campaign by ID
 */
export async function getCampaignById(
  campaignId: string
): Promise<FirestoreVotingCampaign | null> {
  try {
    const doc = await firestore
      .collection(CAMPAIGNS_COLLECTION)
      .doc(campaignId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as FirestoreVotingCampaign;
  } catch (error) {
    console.error("Error getting campaign by ID:", error);
    throw error;
  }
}

/**
 * Create a new campaign
 */
export async function createCampaign(
  campaign: Omit<FirestoreVotingCampaign, "id" | "created_at" | "updated_at">
): Promise<FirestoreVotingCampaign> {
  try {
    const now = new Date();
    const newCampaign = {
      ...campaign,
      participated_voters: [],
      created_at: now,
      updated_at: now,
    };

    const docRef = await firestore
      .collection(CAMPAIGNS_COLLECTION)
      .add(newCampaign);

    return {
      id: docRef.id,
      ...newCampaign,
    };
  } catch (error) {
    console.error("Error creating campaign:", error);
    throw error;
  }
}

/**
 * Update an existing campaign
 */
export async function updateCampaign(
  campaignId: string,
  updates: Partial<Omit<FirestoreVotingCampaign, "id" | "created_at">>
): Promise<FirestoreVotingCampaign> {
  try {
    const now = new Date();
    const campaignRef = firestore
      .collection(CAMPAIGNS_COLLECTION)
      .doc(campaignId);

    await campaignRef.update({
      ...updates,
      updated_at: now,
    });

    const updatedDoc = await campaignRef.get();

    return {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    } as FirestoreVotingCampaign;
  } catch (error) {
    console.error("Error updating campaign:", error);
    throw error;
  }
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  try {
    await firestore.collection(CAMPAIGNS_COLLECTION).doc(campaignId).delete();
  } catch (error) {
    console.error("Error deleting campaign:", error);
    throw error;
  }
}

/**
 * Check if a user has already voted in a campaign
 */
export async function hasUserVoted(
  campaignId: string,
  studentId: string
): Promise<boolean> {
  try {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    return campaign.participated_voters.includes(studentId);
  } catch (error) {
    console.error("Error checking if user voted:", error);
    throw error;
  }
}

/**
 * Submit a vote (ballot)
 */
export async function submitVote(
  campaignId: string,
  studentId: string,
  rule: "choose_all" | "choose_one",
  vote: ChoiceAllVote[] | string
): Promise<FirestoreVotingBallot> {
  try {
    // Check if user has already voted
    const alreadyVoted = await hasUserVoted(campaignId, studentId);
    if (alreadyVoted) {
      throw new Error("User has already voted in this campaign");
    }

    // Get campaign to verify it's open
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const now = new Date();
    if (now < campaign.open_from || now > campaign.open_to) {
      throw new Error("Campaign is not currently open for voting");
    }

    // Create anonymous ballot
    const ballotId = uuidv4(); // Anonymous UUID
    const token = uuidv4(); // Additional anonymous token

    const ballot: Omit<FirestoreVotingBallot, "id"> = {
      campaign_id: campaignId,
      rule,
      token,
      created_at: now,
    };

    if (rule === "choose_all") {
      ballot.choose_all = vote as ChoiceAllVote[];
    } else {
      ballot.choose_one = vote as string;
    }

    // Save ballot (anonymous - no student ID)
    await firestore.collection(BALLOTS_COLLECTION).doc(ballotId).set(ballot);

    // Update campaign participation (tracks who voted, not what they voted)
    await firestore
      .collection(CAMPAIGNS_COLLECTION)
      .doc(campaignId)
      .update({
        participated_voters: [...campaign.participated_voters, studentId],
        updated_at: now,
      });

    return {
      id: ballotId,
      ...ballot,
    };
  } catch (error) {
    console.error("Error submitting vote:", error);
    throw error;
  }
}

/**
 * Get all ballots for a campaign (admin only)
 */
export async function getCampaignBallots(
  campaignId: string
): Promise<FirestoreVotingBallot[]> {
  try {
    const snapshot = await firestore
      .collection(BALLOTS_COLLECTION)
      .where("campaign_id", "==", campaignId)
      .orderBy("created_at", "desc")
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FirestoreVotingBallot[];
  } catch (error) {
    console.error("Error getting campaign ballots:", error);
    throw error;
  }
}

/**
 * Get voting statistics for a campaign (admin only)
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
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const ballots = await getCampaignBallots(campaignId);

    const total_votes = ballots.length;
    const participation_rate =
      campaign.eligible_voters.length > 0
        ? (campaign.participated_voters.length /
            campaign.eligible_voters.length) *
          100
        : 0;

    // Calculate results based on rule
    let results: {
      option_id: string;
      support: number;
      oppose: number;
      neutral: number;
      total: number;
    }[] = [];

    if (campaign.rule === "choose_all") {
      // Initialize results for each option
      const optionMap = new Map<
        string,
        { support: number; oppose: number; neutral: number }
      >();

      campaign.options.forEach((option) => {
        optionMap.set(option.id, { support: 0, oppose: 0, neutral: 0 });
      });

      // Count votes for each option
      ballots.forEach((ballot) => {
        if (ballot.choose_all) {
          ballot.choose_all.forEach((choice) => {
            const stats = optionMap.get(choice.option_id);
            if (stats) {
              if (choice.remark === "我要投給他") {
                stats.support++;
              } else if (choice.remark === "我不投給他") {
                stats.oppose++;
              } else {
                stats.neutral++;
              }
            }
          });
        }
      });

      results = Array.from(optionMap.entries()).map(
        ([option_id, stats]) => ({
          option_id,
          support: stats.support,
          oppose: stats.oppose,
          neutral: stats.neutral,
          total: stats.support + stats.oppose + stats.neutral,
        })
      );
    } else if (campaign.rule === "choose_one") {
      // Count votes for each option
      const optionCounts = new Map<string, number>();

      campaign.options.forEach((option) => {
        optionCounts.set(option.id, 0);
      });

      ballots.forEach((ballot) => {
        if (ballot.choose_one) {
          const count = optionCounts.get(ballot.choose_one) || 0;
          optionCounts.set(ballot.choose_one, count + 1);
        }
      });

      results = Array.from(optionCounts.entries()).map(
        ([option_id, count]) => ({
          option_id,
          support: count,
          oppose: 0,
          neutral: 0,
          total: count,
        })
      );
    }

    return {
      total_votes,
      participation_rate,
      results,
    };
  } catch (error) {
    console.error("Error getting campaign statistics:", error);
    throw error;
  }
}
