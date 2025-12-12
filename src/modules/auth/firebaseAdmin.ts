import admin from "firebase-admin";

function buildCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return admin.credential.cert(serviceAccount);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  if (
    !process.env.FIREBASE_SERVICE_ACCOUNT &&
    !(projectId && clientEmail && privateKey) &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    throw new Error(
      "Firebase credentials are not configured. Provide a service account JSON or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  return admin.credential.applicationDefault();
}

function getFirebaseAdminApp() {
  if (!admin.apps.length) {
    try {
      const credential = buildCredential();
      admin.initializeApp({ credential });
    } catch (error) {
      console.error("Firebase Admin initialization failed", error);
      throw new Error(`Failed to initialize Firebase Admin credentials: ${error}`);
    }
  }

  return admin.app();
}

export function getAuth() {
  return getFirebaseAdminApp().auth();
}

export function getDb() {
  return getFirebaseAdminApp().firestore();
}

export type FirebaseAdminApp = ReturnType<typeof getFirebaseAdminApp>;
