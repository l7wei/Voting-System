/**
 * Firestore Data Models
 * This file defines TypeScript interfaces for Firestore collections
 */

/**
 * User Document Schema
 * Collection: users
 * Document ID: Firebase UID
 */
export interface FirestoreUser {
  uid: string; // Firebase UID
  email: string; // Email from OAuth provider
  name: string; // Display name (from Google or NTHU OAuth)
  inschool: boolean; // Whether the user is a verified student
  student_id?: string; // NTHU Student ID (from NTHU OAuth, optional)
  roles: {
    admin: boolean; // Admin role
    student: boolean; // Student role
  };
  auth_providers: ("google" | "nthu")[]; // Array of linked auth providers
  created_at: Date;
  updated_at: Date;
}

/**
 * Voting Campaign Document Schema
 * Collection: modules_voting_campaigns
 * Document ID: Auto-generated
 */
export interface FirestoreVotingCampaign {
  id: string; // Document ID
  name: string; // Campaign name
  type: string; // Campaign type
  description?: string; // Campaign description
  rule: "choose_all" | "choose_one"; // Voting rule
  options: VotingOption[]; // Array of voting options
  open_from: Date; // Start time
  open_to: Date; // End time
  eligible_voters: string[]; // Array of student IDs who can vote
  participated_voters: string[]; // Array of student IDs who have voted (for participation tracking only)
  created_at: Date;
  updated_at: Date;
  created_by: string; // UID of creator
}

/**
 * Voting Option (embedded in campaign)
 */
export interface VotingOption {
  id: string; // Option ID
  name: string; // Option name
  description?: string; // Option description
}

/**
 * Ballot Document Schema
 * Collection: modules_voting_ballots
 * Document ID: Auto-generated UUID (for anonymity)
 *
 * Note: This collection stores anonymous votes.
 * There is NO reference to the voter's identity.
 */
export interface FirestoreVotingBallot {
  id: string; // Document ID (UUID for anonymity)
  campaign_id: string; // Reference to campaign document ID
  rule: "choose_all" | "choose_one"; // Voting rule (duplicated for easier querying)
  choose_all?: ChoiceAllVote[]; // For choose_all rule
  choose_one?: string; // For choose_one rule (option ID)
  token: string; // Anonymous UUID token
  created_at: Date;
}

/**
 * Choice All Vote (embedded in ballot)
 */
export interface ChoiceAllVote {
  option_id: string;
  remark: "我要投給他" | "我不投給他" | "我沒有意見";
}

/**
 * NTHU OAuth Payload
 * Data received from VM proxy after NTHU OAuth
 */
export interface NTHUOAuthPayload {
  student_id: string; // Userid from NTHU
  name: string; // Name from NTHU
  inschool: boolean; // Whether the student is currently enrolled
  uuid: string; // UUID from NTHU OAuth
}

/**
 * Auth Handshake Request
 * Request body for /api/internal/auth-handshake
 */
export interface AuthHandshakeRequest {
  api_key: string; // Shared secret for VM proxy authentication
  provider: "nthu";
  payload: NTHUOAuthPayload;
  timestamp: number; // Unix timestamp for replay attack prevention
}

/**
 * Session Cookie Claims
 * Custom claims stored in Firebase session cookie
 */
export interface SessionCookieClaims {
  uid: string;
  email: string;
  name: string;
  student_id?: string;
  inschool: boolean;
  roles: {
    admin: boolean;
    student: boolean;
  };
  auth_providers: ("google" | "nthu")[];
}
