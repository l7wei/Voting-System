import "server-only";
import { firestore, firebaseAuth } from "./firebase-admin";
import {
  FirestoreUser,
  NTHUOAuthPayload,
  SessionCookieClaims,
} from "../types/firestore";
import { readFile } from "fs/promises";
import { join } from "path";
import { parse } from "csv-parse/sync";

/**
 * User Service
 * Handles all user-related operations with Firestore
 */

const USERS_COLLECTION = "users";

// Cache for admin and voter lists
let adminCache: Set<string> = new Set();
let voterCache: Set<string> = new Set();
let adminCacheTime = 0;
let voterCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load admin list from CSV
 */
async function loadAdmins(): Promise<Set<string>> {
  const now = Date.now();
  if (adminCache.size > 0 && now - adminCacheTime < CACHE_DURATION) {
    return adminCache;
  }

  try {
    const filePath = join(process.cwd(), "data", "adminList.csv");
    const fileContent = await readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    adminCache = new Set(
      records.map((record: { student_id: string }) => record.student_id)
    );
    adminCacheTime = now;
    return adminCache;
  } catch (error) {
    console.error("Error loading adminList.csv:", error);
    return new Set();
  }
}

/**
 * Load voter list from CSV
 */
async function loadVoters(): Promise<Set<string>> {
  const now = Date.now();
  if (voterCache.size > 0 && now - voterCacheTime < CACHE_DURATION) {
    return voterCache;
  }

  try {
    const filePath = join(process.cwd(), "data", "voterList.csv");
    const fileContent = await readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    voterCache = new Set(
      records.map((record: { student_id: string }) => record.student_id)
    );
    voterCacheTime = now;
    return voterCache;
  } catch (error) {
    console.error("Error loading voterList.csv:", error);
    return new Set();
  }
}

/**
 * Check if a student ID is an admin
 */
export async function isAdmin(studentId: string): Promise<boolean> {
  const admins = await loadAdmins();
  return admins.has(studentId);
}

/**
 * Check if a student ID is eligible to vote
 */
export async function isEligibleVoter(studentId: string): Promise<boolean> {
  const voters = await loadVoters();
  return voters.has(studentId);
}

/**
 * Get user by UID
 */
export async function getUserByUid(uid: string): Promise<FirestoreUser | null> {
  try {
    const userDoc = await firestore.collection(USERS_COLLECTION).doc(uid).get();

    if (!userDoc.exists) {
      return null;
    }

    return userDoc.data() as FirestoreUser;
  } catch (error) {
    console.error("Error getting user by UID:", error);
    throw error;
  }
}

/**
 * Get user by student ID
 */
export async function getUserByStudentId(
  studentId: string
): Promise<FirestoreUser | null> {
  try {
    const querySnapshot = await firestore
      .collection(USERS_COLLECTION)
      .where("student_id", "==", studentId)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestoreUser;
  } catch (error) {
    console.error("Error getting user by student ID:", error);
    throw error;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(
  email: string
): Promise<FirestoreUser | null> {
  try {
    const querySnapshot = await firestore
      .collection(USERS_COLLECTION)
      .where("email", "==", email)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestoreUser;
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw error;
  }
}

/**
 * Create or update user from Google OAuth
 */
export async function createOrUpdateUserFromGoogle(
  uid: string,
  email: string,
  name: string
): Promise<FirestoreUser> {
  try {
    const userRef = firestore.collection(USERS_COLLECTION).doc(uid);
    const userDoc = await userRef.get();

    const now = new Date();

    if (userDoc.exists) {
      // Update existing user
      const existingUser = userDoc.data() as FirestoreUser;

      // Only update if Google is not already linked
      if (!existingUser.auth_providers.includes("google")) {
        await userRef.update({
          auth_providers: [...existingUser.auth_providers, "google"],
          email: email, // Update email if changed
          updated_at: now,
        });

        return {
          ...existingUser,
          auth_providers: [...existingUser.auth_providers, "google"],
          email,
          updated_at: now,
        };
      }

      return existingUser;
    } else {
      // Create new user
      const newUser: FirestoreUser = {
        uid,
        email,
        name,
        inschool: false, // Default to false until NTHU OAuth is linked
        roles: {
          admin: false,
          student: false,
        },
        auth_providers: ["google"],
        created_at: now,
        updated_at: now,
      };

      await userRef.set(newUser);
      return newUser;
    }
  } catch (error) {
    console.error("Error creating/updating user from Google:", error);
    throw error;
  }
}

/**
 * Create or update user from NTHU OAuth
 */
export async function createOrUpdateUserFromNTHU(
  payload: NTHUOAuthPayload,
  existingUid?: string
): Promise<FirestoreUser> {
  try {
    const { student_id, name, inschool } = payload;

    // Check if user with this student_id already exists
    const existingUser = await getUserByStudentId(student_id);

    const now = new Date();
    const adminStatus = await isAdmin(student_id);
    const voterStatus = await isEligibleVoter(student_id);

    if (existingUser) {
      // Update existing user
      const userRef = firestore
        .collection(USERS_COLLECTION)
        .doc(existingUser.uid);

      const updates: Partial<FirestoreUser> = {
        name, // Update name from NTHU
        inschool,
        roles: {
          admin: adminStatus,
          student: voterStatus,
        },
        updated_at: now,
      };

      // Add NTHU to auth providers if not already present
      if (!existingUser.auth_providers.includes("nthu")) {
        updates.auth_providers = [...existingUser.auth_providers, "nthu"];
      }

      await userRef.update(updates);

      return {
        ...existingUser,
        ...updates,
      } as FirestoreUser;
    } else if (existingUid) {
      // Link NTHU to existing Google user
      const userRef = firestore.collection(USERS_COLLECTION).doc(existingUid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new Error("User not found for linking");
      }

      const user = userDoc.data() as FirestoreUser;

      const updates: Partial<FirestoreUser> = {
        student_id,
        name, // Replace with NTHU name
        inschool,
        roles: {
          admin: adminStatus,
          student: voterStatus,
        },
        updated_at: now,
      };

      if (!user.auth_providers.includes("nthu")) {
        updates.auth_providers = [...user.auth_providers, "nthu"];
      }

      await userRef.update(updates);

      return {
        ...user,
        ...updates,
      } as FirestoreUser;
    } else {
      // Create new user from NTHU OAuth
      const userRecord = await firebaseAuth.createUser({
        displayName: name,
        // Use a proper email format for NTHU users
        // This follows the pattern: studentid@m{year}.nthu.edu.tw
        // which is similar to actual NTHU student email format
        email: `${student_id}@m${student_id.substring(0, 3)}.nthu.edu.tw`,
      });

      const newUser: FirestoreUser = {
        uid: userRecord.uid,
        email: `${student_id}@m${student_id.substring(0, 3)}.nthu.edu.tw`,
        name,
        inschool,
        student_id,
        roles: {
          admin: adminStatus,
          student: voterStatus,
        },
        auth_providers: ["nthu"],
        created_at: now,
        updated_at: now,
      };

      await firestore
        .collection(USERS_COLLECTION)
        .doc(userRecord.uid)
        .set(newUser);

      return newUser;
    }
  } catch (error) {
    console.error("Error creating/updating user from NTHU:", error);
    throw error;
  }
}

/**
 * Create session cookie for user
 */
export async function createSessionCookie(
  user: FirestoreUser,
  expiresIn: number = 5 * 24 * 60 * 60 * 1000 // 5 days
): Promise<string> {
  try {
    // Create custom token first
    const customToken = await firebaseAuth.createCustomToken(user.uid, {
      email: user.email,
      name: user.name,
      student_id: user.student_id,
      inschool: user.inschool,
      roles: user.roles,
      auth_providers: user.auth_providers,
    });

    // In a real implementation, the client would exchange this for an ID token
    // For server-side, we'll create a session cookie directly
    // Note: This requires the ID token from the client in production
    // For now, we'll return the custom token
    return customToken;
  } catch (error) {
    console.error("Error creating session cookie:", error);
    throw error;
  }
}

/**
 * Get session claims from user
 */
export function getSessionClaims(user: FirestoreUser): SessionCookieClaims {
  return {
    uid: user.uid,
    email: user.email,
    name: user.name,
    student_id: user.student_id,
    inschool: user.inschool,
    roles: user.roles,
    auth_providers: user.auth_providers,
  };
}
