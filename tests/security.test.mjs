import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilename, isSafePath, validateFileSignature } from "../services/security/validator.ts";
import { db } from "../services/database/db.ts";

test("Security - Path Traversal Prevention in Sanitization", () => {
  const maliciousName1 = "../../../../windows/system32/cmd.exe";
  const safe1 = sanitizeFilename(maliciousName1);
  assert.ok(!safe1.includes(".."));
  assert.ok(!safe1.includes("/"));
  assert.ok(!safe1.includes("\\"));

  const maliciousName2 = "..\\..\\sensitive.docx";
  const safe2 = sanitizeFilename(maliciousName2);
  assert.ok(!safe2.includes(".."));
});

test("Security - Boundary Path Verification", () => {
  const baseDir = "C:\\Users\\User\\Desktop\\Chienluoc\\data\\secure_storage";
  const safeTarget = "C:\\Users\\User\\Desktop\\Chienluoc\\data\\secure_storage\\safe_file.docx";
  const dangerousTarget = "C:\\Users\\User\\Desktop\\Chienluoc\\public\\exposed.docx";

  assert.equal(isSafePath(baseDir, safeTarget), true);
  assert.equal(isSafePath(baseDir, dangerousTarget), false);
});

test("Security - File Signature & Extension Spoofing Detection", () => {
  // Disguised executable named .pdf
  const fakePdfBuffer = Buffer.from("MZThisIsAnExecutableFileBinaryContent");
  const result = validateFileSignature(fakePdfBuffer, "malicious.pdf");
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("File signature mismatch"));

  // Real PDF header (%PDF-1.4)
  const realPdfBuffer = Buffer.from("%PDF-1.4\n%Test PDF binary stream");
  const validPdfResult = validateFileSignature(realPdfBuffer, "legit.pdf");
  assert.equal(validPdfResult.valid, true);
  assert.equal(validPdfResult.detectedType, "pdf");

  // Real ZIP header (PK\x03\x04)
  const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const validXlsxResult = validateFileSignature(zipBuffer, "glossary.xlsx");
  assert.equal(validXlsxResult.valid, true);
  assert.equal(validXlsxResult.detectedType, "xlsx");
});

test("Security - Zero-Leak Audit Logging Policy Verification", () => {
  // Verify that even if someone attempts to pass confidential text fields to audit log,
  // the database layer scrubs them completely
  const sensitiveSource = "CONFIDENTIAL_MERGER_STRATEGY_ACME_CORP";
  const sensitiveTarget = "CHIEN_LUOC_SAP_NHAP_BI_MAT";

  db.addAuditLog({
    userId: "test_user",
    userEmail: "test@secure.local",
    operation: "TRANSLATE_TEST",
    status: "SUCCESS",
    durationMs: 15,
    details: {
      sourceText: sensitiveSource,
      targetText: sensitiveTarget,
      safeMetric: 42,
    },
  });

  const logs = db.getAuditLogs();
  const latestLog = logs[0];
  assert.equal(latestLog.operation, "TRANSLATE_TEST");
  assert.equal(latestLog.details?.sourceText, undefined, "sourceText must be scrubbed");
  assert.equal(latestLog.details?.targetText, undefined, "targetText must be scrubbed");
  assert.equal(latestLog.details?.safeMetric, 42);

  // Full string dump of log must NOT contain sensitive strings
  const stringifiedLog = JSON.stringify(latestLog);
  assert.ok(!stringifiedLog.includes(sensitiveSource));
  assert.ok(!stringifiedLog.includes(sensitiveTarget));
});


test("Security - AES-256-GCM Encryption and Decryption", async () => {
  const { encryptData, decryptData } = await import("../services/security/encryption.ts");
  const sensitiveSecret = "api_key_secret_test_value_xyz123";
  const payload = encryptData(sensitiveSecret);

  assert.notEqual(payload.data, sensitiveSecret);
  assert.ok(payload.iv);
  assert.ok(payload.authTag);

  const decrypted = decryptData(payload);
  assert.equal(decrypted, sensitiveSecret);
});

test("Security - Rate Limiter Enforces Maximum Requests", async () => {
  const { checkRateLimit } = await import("../services/security/encryption.ts");
  const ip = "192.168.1.100";

  for (let i = 0; i < 5; i++) {
    const res = checkRateLimit(ip, 5, 10000);
    assert.equal(res.allowed, true);
  }

  const blocked = checkRateLimit(ip, 5, 10000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test("Security - Secure File Overwrite and Deletion", async () => {
  const { saveToPrivateStorage, secureDeleteFile } = await import("../services/security/storage.ts");
  const fs = await import("fs");

  const testContent = Buffer.from("TOP_SECRET_MILITARY_OR_FACTORY_STRATEGY");
  const stored = saveToPrivateStorage(testContent, "confidential.pdf");

  assert.ok(fs.existsSync(stored.filePath));
  const deleted = secureDeleteFile(stored.filePath);
  assert.equal(deleted, true);
  assert.equal(fs.existsSync(stored.filePath), false);
});
