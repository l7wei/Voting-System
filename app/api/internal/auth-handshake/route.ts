import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAuth, getDb } from "@/src/modules/auth/firebaseAdmin";
import {
  handshakePayloadSchema,
  type HandshakePayload,
} from "@/src/modules/auth/types";
import { COLLECTIONS } from "@/src/modules/shared/firestore";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function isFirebaseAuthError(error: unknown): error is { code: string } {
  return typeof (error as { code?: unknown })?.code === "string";
}

function deriveUid(payload: HandshakePayload) {
  // Prefer Google UID when available; otherwise namespace NTHU IDs to avoid collisions.
  if (payload.google_uid && !payload.google_uid.startsWith("nthu:")) {
    return payload.google_uid;
  }

  return `nthu:${payload.student_id}`;
}

export async function POST(req: NextRequest) {
  const sharedSecret = process.env.AUTH_PROXY_SHARED_SECRET;
  if (!sharedSecret) {
    return NextResponse.json(
      { error: "Server misconfigured: missing AUTH_PROXY_SHARED_SECRET" },
      { status: 500 },
    );
  }

  const providedSecret = req.headers.get("x-internal-api-key");

  if (providedSecret !== sharedSecret) {
    return unauthorized("Unauthorized auth proxy caller");
  }

  let payload;
  try {
    payload = handshakePayloadSchema.parse(await req.json());
  } catch (error) {
    console.error("Invalid payload from auth proxy", error);
    return NextResponse.json(
      { error: "Invalid payload from auth proxy" },
      { status: 400 },
    );
  }

  try {
    const auth = getAuth();
    const db = getDb();

    const uid = deriveUid(payload);

    // Ensure user exists in Firebase Auth
    try {
      await auth.getUser(uid);
    } catch (error: unknown) {
      if (isFirebaseAuthError(error) && error.code === "auth/user-not-found") {
        await auth.createUser({
          uid,
          displayName: payload.name,
          email: payload.email,
          emailVerified: Boolean(payload.email),
        });
      } else {
        throw error;
      }
    }

    // Upsert profile in Firestore
    const userDocRef = db.collection(COLLECTIONS.USERS).doc(uid);
    const existingSnapshot = await userDocRef.get();
    const existing = existingSnapshot.data();

    const providers = new Set<string>(existing?.auth_providers ?? []);
    providers.add("nthu");
    if (payload.google_uid || existing?.auth_providers?.includes("google")) {
      providers.add("google");
    }

    const roles = {
      admin: existing?.roles?.admin ?? false,
      student: true,
    };

    const profile = {
      uid,
      email: payload.email ?? existing?.email ?? null,
      name: payload.name,
      inschool: payload.inschool ?? existing?.inschool ?? false,
      student_id: payload.student_id ?? existing?.student_id,
      roles,
      auth_providers: Array.from(providers),
      is_verified_student:
        payload.inschool ?? existing?.is_verified_student ?? false,
      updated_at: FieldValue.serverTimestamp(),
    };

    if (existingSnapshot.exists) {
      await userDocRef.update(profile);
    } else {
      await userDocRef.set(
        { ...profile, created_at: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    // Issue a short-lived custom token so the frontend can exchange it for a session cookie
    const customToken = await auth.createCustomToken(uid, {
      student_id: payload.student_id,
      inschool: payload.inschool ?? false,
    });

    return NextResponse.json({
      ok: true,
      uid,
      customToken,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to complete auth handshake", details: `${error}` },
      { status: 500 },
    );
  }
}
