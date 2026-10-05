import crypto from "crypto";

// AES-256-GCM authenticated encryption for sensitive payloads (API keys, temporary cache)
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || "secure-translator-aes-gcm-master-key-32b!";
const ALGORITHM = "aes-256-gcm";

function getMasterKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  data: string;
}

/**
 * Encrypts arbitrary text using AES-256-GCM.
 */
export function encryptData(plainText: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    authTag,
    data: encrypted,
  };
}

/**
 * Decrypts AES-256-GCM encrypted payload back to string.
 */
export function decryptData(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(payload.data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Simple in-memory sliding window rate limiter for security endpoints.
 */
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  identifier: string,
  limit = 60,
  windowMs = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let record = rateLimitMap.get(identifier);

  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(identifier, record);
  }

  // Remove timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.timestamps.push(now);
  return { allowed: true, remaining: limit - record.timestamps.length };
}
