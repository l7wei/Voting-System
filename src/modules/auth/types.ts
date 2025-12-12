import { z } from "zod";

export const handshakePayloadSchema = z.object({
  student_id: z
    .string()
    .regex(/^[0-9A-Za-z]{6,}$/, "Invalid student_id format"),
  name: z.string().min(1),
  email: z.string().email().optional(),
  inschool: z.boolean().optional(),
  google_uid: z.string().optional(),
  auth_provider: z.enum(["nthu", "google"]).default("nthu").optional(),
  nonce: z.string().optional(),
});

export type HandshakePayload = z.infer<typeof handshakePayloadSchema>;

export type UserProfile = {
  uid: string;
  email?: string | null;
  name: string;
  inschool: boolean;
  student_id?: string;
  roles: {
    admin: boolean;
    student: boolean;
  };
  auth_providers: string[];
  is_verified_student?: boolean;
  updated_at?: FirebaseFirestore.FieldValue;
  created_at?: FirebaseFirestore.FieldValue;
};
