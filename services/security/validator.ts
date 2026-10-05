import path from "path";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: "xlsx" | "docx" | "pptx" | "pdf";
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Validates file headers/magic numbers to prevent extension spoofing.
 */
export function validateFileSignature(buffer: Buffer, originalFilename: string): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File is empty" };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: "File exceeds 25MB maximum limit" };
  }

  const ext = path.extname(originalFilename).toLowerCase().replace(".", "");

  // Magic bytes check
  // PDF: starts with '%PDF-' (0x25 0x50 0x44 0x46 0x2D)
  const isPdf =
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;

  // ZIP/Office Open XML (DOCX, PPTX, XLSX): starts with 'PK\x03\x04' (0x50 0x4B 0x03 0x04)
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4B &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  // Compound File Binary (legacy XLS): starts with 0xD0 0xCF 0x11 0xE0
  const isCfb =
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  if (ext === "pdf") {
    if (!isPdf) {
      return { valid: false, error: "File signature mismatch: expected valid PDF file" };
    }
    return { valid: true, detectedType: "pdf" };
  }

  if (["xlsx", "docx", "pptx"].includes(ext)) {
    if (!isZip) {
      // If extension is xlsx but file is actually legacy xls (or vice-versa)
      if (ext === "xlsx" && isCfb) {
        return { valid: true, detectedType: "xlsx" };
      }
      return { valid: false, error: `File signature mismatch: expected valid ${ext.toUpperCase()} archive` };
    }
    return { valid: true, detectedType: ext as "xlsx" | "docx" | "pptx" };
  }

  if (ext === "xls") {
    if (isCfb || isZip) {
      return { valid: true, detectedType: "xlsx" };
    }
    return { valid: false, error: "File signature mismatch: expected valid XLS spreadsheet" };
  }

  if (ext === "csv") {
    return { valid: true, detectedType: "xlsx" };
  }

  return {
    valid: false,
    error: `Unsupported file extension .${ext}. Allowed: .xlsx, .xls, .csv, .docx, .pptx, .pdf`,
  };
}

/**
 * Sanitizes filenames to eliminate path traversal attacks, null bytes, and malicious characters.
 */
export function sanitizeFilename(filename: string): string {
  // Remove directory traversal characters (../, ..\, etc.)
  const basename = path.basename(filename);
  // Strip control characters, null bytes, and non-printable chars
  const sanitized = basename
    .replace(/[\x00-\x1f\x80-\x9f]/g, "")
    .replace(/[^a-zA-Z0-9._\-]/g, "_");

  // Prevent hidden files or empty filenames
  if (!sanitized || sanitized.startsWith(".")) {
    return `doc_${Date.now()}_${sanitized || "file"}`;
  }

  return sanitized;
}

/**
 * Validates that a file path is safely confined within the storage directory.
 */
export function isSafePath(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}
