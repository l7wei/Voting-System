import "server-only";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let app: App;
let db: Firestore;
let auth: Auth;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials in production
 * Uses emulator in development
 */
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    if (process.env.NODE_ENV === "production") {
      // Production: Use service account credentials
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!serviceAccount) {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required in production"
        );
      }

      app = initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Development: Use default credentials or emulator
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "demo-voting-portal",
      });

      // Set emulator hosts if specified
      if (process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.FIRESTORE_EMULATOR_HOST =
          process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080";
      }
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST =
          process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099";
      }
    }
  } else {
    app = getApps()[0];
  }

  db = getFirestore(app);
  auth = getAuth(app);

  return { app, db, auth };
}

// Initialize on module load
const { app: firebaseApp, db: firestore, auth: firebaseAuth } =
  initializeFirebaseAdmin();

export { firebaseApp, firestore, firebaseAuth };
export default firebaseApp;
