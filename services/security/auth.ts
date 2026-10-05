import crypto from "crypto";
import { User, UserRole } from "../database/types";
import { db } from "../database/db";

const JWT_SECRET = process.env.JWT_SECRET || "secure-translator-dev-secret-38291";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Creates a lightweight signed token for session authentication.
 */
export function createSessionToken(user: User): string {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  const strPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(strPayload)
    .digest("base64url");
  return `${strPayload}.${signature}`;
}

/**
 * Verifies a session token.
 */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [strPayload, signature] = parts;

    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(strPayload)
      .digest("base64url");

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(strPayload, "base64url").toString("utf-8"));
    if (payload.exp < Date.now()) return null;

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Checks role-based permissions:
 * - Admin: All operations
 * - Translator: Upload, Translate, View glossary, Suggest terms
 * - Reviewer: Approve/reject terms, review translations, translate
 * - Viewer: View permitted content
 */
export function checkPermission(
  user: SessionUser | null,
  action: "upload" | "translate" | "approve_terms" | "manage_users" | "settings" | "audit"
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;

  switch (action) {
    case "upload":
    case "translate":
      return ["admin", "translator", "reviewer"].includes(user.role);
    case "approve_terms":
      return ["admin", "reviewer"].includes(user.role);
    case "audit":
      return ["admin", "reviewer", "viewer"].includes(user.role);
    case "settings":
    case "manage_users":
      return false;
    default:
      return false;
  }
}
