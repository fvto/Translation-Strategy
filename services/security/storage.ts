import fs from "fs";
import path from "path";
import crypto from "crypto";
import { sanitizeFilename, isSafePath } from "./validator";

const SECURE_DIR = path.resolve(process.cwd(), "data", "secure_storage");

export function getSecureStorageDir(): string {
  if (!fs.existsSync(SECURE_DIR)) {
    fs.mkdirSync(SECURE_DIR, { recursive: true, mode: 0o700 });
  }
  return SECURE_DIR;
}

export interface StoredFile {
  filePath: string;
  sanitizedName: string;
  sizeBytes: number;
}

/**
 * Saves an uploaded file buffer to protected non-public storage.
 */
export function saveToPrivateStorage(buffer: Buffer, originalFilename: string): StoredFile {
  const dir = getSecureStorageDir();
  const safeName = sanitizeFilename(originalFilename);
  const randomPrefix = crypto.randomBytes(8).toString("hex");
  const storedFilename = `${randomPrefix}_${safeName}`;
  const filePath = path.join(dir, storedFilename);

  if (!isSafePath(dir, filePath)) {
    throw new Error("Security Violation: Path traversal attempt detected.");
  }

  // Write file with restricted permissions
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });

  return {
    filePath,
    sanitizedName: safeName,
    sizeBytes: buffer.length,
  };
}

/**
 * Securely deletes a temporary or requested file from disk.
 */
export function secureDeleteFile(filePath: string): boolean {
  try {
    const dir = getSecureStorageDir();
    if (!isSafePath(dir, filePath)) {
      throw new Error("Security Violation: Target path is outside secure storage.");
    }

    if (fs.existsSync(filePath)) {
      // Overwrite with zeros before unlinking to prevent disk recovery of confidential data
      const size = fs.statSync(filePath).size;
      if (size > 0 && size < 50 * 1024 * 1024) {
        fs.writeFileSync(filePath, Buffer.alloc(size, 0));
      }
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (e) {
    console.error("Failed to securely delete file:", e);
    return false;
  }
}
