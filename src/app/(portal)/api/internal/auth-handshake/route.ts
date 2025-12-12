import { NextRequest, NextResponse } from "next/server";
import { createOrUpdateUserFromNTHU } from "@/src/modules/shared/lib/user-service";
import { AuthHandshakeRequest } from "@/src/modules/shared/types/firestore";

/**
 * Internal Auth Handshake Endpoint
 * This endpoint receives NTHU OAuth data from the VM proxy
 * and creates/updates the user in Firestore
 *
 * Security: Protected by API key shared between VM and Cloud Run
 */

const AUTH_API_KEY = process.env.AUTH_HANDSHAKE_API_KEY;
const MAX_TIMESTAMP_DIFF = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Verify API key
    if (!AUTH_API_KEY) {
      console.error("AUTH_HANDSHAKE_API_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body: AuthHandshakeRequest = await request.json();

    // Validate API key
    if (body.api_key !== AUTH_API_KEY) {
      console.error("Invalid API key in auth handshake request");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Prevent replay attacks - check timestamp
    // Only allow recent past timestamps (not future)
    const now = Date.now();
    const timeDiff = now - body.timestamp;
    
    if (timeDiff > MAX_TIMESTAMP_DIFF || timeDiff < 0) {
      console.error("Timestamp too old or in future", { timeDiff, now, requestTimestamp: body.timestamp });
      return NextResponse.json(
        { error: "Invalid timestamp" },
        { status: 400 }
      );
    }

    // Validate provider
    if (body.provider !== "nthu") {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    // Validate payload
    const { payload } = body;
    if (!payload.student_id || !payload.name || typeof payload.inschool !== "boolean") {
      return NextResponse.json(
        { error: "Invalid payload - missing required fields" },
        { status: 400 }
      );
    }

    // Create or update user in Firestore
    const user = await createOrUpdateUserFromNTHU(payload);

    // Create session token (custom token for Firebase Auth)
    // In production, this would be exchanged for a session cookie
    const { firebaseAuth } = await import("@/src/modules/shared/lib/firebase-admin");
    const customToken = await firebaseAuth.createCustomToken(user.uid, {
      email: user.email,
      name: user.name,
      student_id: user.student_id,
      inschool: user.inschool,
      roles: user.roles,
      auth_providers: user.auth_providers,
    });

    // Return success with token and user data
    return NextResponse.json({
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        student_id: user.student_id,
        inschool: user.inschool,
        roles: user.roles,
      },
      token: customToken,
    });
  } catch (error) {
    console.error("Error in auth handshake:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
