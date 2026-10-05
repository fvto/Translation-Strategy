import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../services/database/db.ts";
import { AirGappedTranslationProvider } from "../services/translation/offline.ts";
import { getTranslationProvider } from "../services/translation/index.ts";

test("Reverse Translation - VI to EN manufacturing instructions", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const text = `*Bao trung đế sau khi cắt lazer :
1.Kiểm tra đường cắt laze cách biên trung đế 15mm.
2.Kiểm tra lỗ cắt đúng tiêu chuẩn file.`;

  const response = await provider.translate({
    sourceText: text,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  console.log("\n=== Translated VI to EN Result ===");
  console.log(response.translatedText);
  console.log("==================================\n");

  // Verify that Vietnamese text was translated to English
  assert.ok(!response.translatedText.includes("Bao trung đế"));
  assert.ok(!response.translatedText.includes("Kiểm tra"));
  assert.ok(!response.translatedText.includes("đường cắt"));
  assert.ok(!response.translatedText.includes("tiêu chuẩn"));
  assert.ok(response.translatedText.toLowerCase().includes("strobel"));
  assert.ok(response.translatedText.toLowerCase().includes("laser"));
  assert.ok(response.translatedText.toLowerCase().includes("check"));
  assert.ok(response.translatedText.includes("15mm"));
});

test("Reverse Translation - VI to EN punching and vamp instructions", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const text = `*Đục lỗ mặt trước:
1.Kiểm tra sử dụng cây đục 1.8mm ,không bị biến dạng
2.Kiểm tra  mặt trước sau khi đục phải khớp rập đo,lỗ không biến dạng ,không thông,thiếu lỗ.`;

  const response = await provider.translate({
    sourceText: text,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  console.log("\n=== Translated Punching Instructions Result ===");
  console.log(response.translatedText);
  console.log("================================================\n");

  // Verify that all Vietnamese manufacturing terms are translated to English
  assert.ok(!response.translatedText.includes("Đục lỗ"));
  assert.ok(!response.translatedText.includes("mặt trước"));
  assert.ok(!response.translatedText.includes("sử dụng"));
  assert.ok(!response.translatedText.includes("cây đục"));
  assert.ok(!response.translatedText.includes("biến dạng"));
  assert.ok(!response.translatedText.includes("khớp rập đo"));
  assert.ok(!response.translatedText.includes("không thông"));
  assert.ok(!response.translatedText.includes("thiếu lỗ"));
});

test("Reverse Translation - VI to EN skiving, buffing, and PFC standard instructions", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const text = `1.Kiểm tra rập lạng và cử máy lạng/mài phải đúng tiêu chuẩn theo từng bộ vị
2.Kiểm tra đặt liệu vào rập lạng/mài phải khớp rập hoặc vừa tới cử của máy
3.Kiểm tra sau khi lạng/mài độ rộng và độ dày phải theo tiêu chuẩn PFC cho từng bộ vị để tránh tình giày thành phẩm bị ngấn/cộm,trề biên liệu`;

  const response = await provider.translate({
    sourceText: text,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  console.log("\n=== Translated Skiving/Buffing Result ===");
  console.log(response.translatedText);
  console.log("=========================================\n");

  // Verify that NO Vietnamese words remain untranslated
  const viCharsRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  assert.ok(!viCharsRegex.test(response.translatedText), "Translated text should contain zero Vietnamese accented characters");
});

test("Reverse Translation - VI to EN handles unspaced punctuation like .Do without dropping sentences", async () => {
  const provider = getTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const unspacedText = `3.Kiểm tra sau khi chặt  sớ liệu lưỡi phải thẳng,đường cắt trên lưỡi đứt hoàn toàn .Do tính chất liệu ngay vị trí cắt trên lưỡi tưa liệu chấp nhận theo QA-manual cập nhận`;

  const response = await provider.translate({
    sourceText: unspacedText,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  console.log("\n=== Translated .Do Unspaced Result ===");
  console.log(response.translatedText);
  console.log("======================================\n");

  // Verify that the second sentence wasn't truncated or dropped
  assert.ok(
    response.translatedText.toLowerCase().includes("natural material"),
    "Should include translated 'natural material' from the second sentence"
  );
  assert.ok(
    response.translatedText.toLowerCase().includes("qa-manual"),
    "Should include 'QA-manual' from the end of the second sentence"
  );
  // Verify that it starts with '3. Check'
  assert.ok(
    response.translatedText.startsWith("3. Check"),
    "Numbered item should be capitalized and spaced correctly"
  );
    assert.doesNotMatch(
      response.translatedText,
      /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i,
      "Reverse translation should not leave Vietnamese accented words"
    );
});

test("Reverse Translation - VI to EN translates sewing PFC instructions completely", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");
  const text = `1. Kiểm tra điều chỉnh máy số mũi kim và cữ may cách biên có đúng tiêu chuẩn PFC
2. Đảm bảo sau khi may bị vi dạt tiêu chuẩn cách biên /kim theo PFC, không đứt chỉ, sụp mí`;

  const response = await provider.translate({
    sourceText: text,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  assert.match(response.translatedText, /check needle stitch count machine adjustment/i);
  assert.match(response.translatedText, /stitching margin guide meet PFC standard/i);
  assert.match(response.translatedText, /ensure that after stitching/i);
  assert.match(response.translatedText, /broken thread/i);
  assert.match(response.translatedText, /run-off stitching/i);
  assert.doesNotMatch(response.translatedText, /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i);
});

test("Reverse Translation - VI to EN uses SPI ... stitches/inch for stitch density", async () => {
  const provider = new AirGappedTranslationProvider();
  const response = await provider.translate({
    sourceText: "Mật độ đường may là 9-10 mũi/inch.",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: db.getApprovedTerminology("vi", "en"),
  });

  assert.match(response.translatedText, /SPI 9-10 stitches\/inch/i);
});

test("Reverse Translation - VI to EN translates 11-12 mũi/inch to SPI 11-12 stitches/inch without inserting 9-10", async () => {
  const provider = new AirGappedTranslationProvider();
  const response = await provider.translate({
    sourceText: "Kiểm tra may cách biên 3.0mm 11-12 mũi/inch",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: db.getApprovedTerminology("vi", "en"),
  });

  assert.match(response.translatedText, /SPI 11-12 stitches\/inch/i);
  assert.doesNotMatch(response.translatedText, /9-10/);
});

test("Reverse Translation - VI to EN translates 10-12 mũi/inch to SPI 10-12 stitches/inch", async () => {
  const provider = new AirGappedTranslationProvider();
  const response = await provider.translate({
    sourceText: "Sử dụng 3mm nylon tape để may vòng cổ, cách biên 2mm 10-12 mũi/inch",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: db.getApprovedTerminology("vi", "en"),
  });

  assert.match(response.translatedText, /SPI 10-12 stitches\/inch/i);
  assert.doesNotMatch(response.translatedText, /10-12 SPI\b/i);
});

test("Reverse Translation - VI to EN translates 9-10 mũi to SPI 9-10 stitches/inch", async () => {
  const provider = new AirGappedTranslationProvider();
  const response = await provider.translate({
    sourceText: "9-10 mũi",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: db.getApprovedTerminology("vi", "en"),
  });

  assert.match(response.translatedText, /SPI 9-10 stitches\/inch/i);
  assert.doesNotMatch(response.translatedText, /tip/i);
  assert.doesNotMatch(response.translatedText, /mũi/i);
});

test("Reverse Translation - VI to EN translates SOP defect terminology correctly", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const sample = "Kiểm tra phát hiện lỗi bọt khí, hở keo, ngấn và độ gập ghềnh/ổn định trên đế.";
  const res = await provider.translate({
    sourceText: sample,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  const lower = res.translatedText.toLowerCase();
  assert.ok(lower.includes("air bubble") || lower.includes("bubble"));
  assert.ok(lower.includes("bond gap"));
  assert.ok(lower.includes("visible mark") || lower.includes("rocking"));
});

test("Reverse Translation - VI to EN translates Tip shaping and Tip shape with correct noun order", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const resShape = await provider.translate({
    sourceText: "Kiểm tra hình dạng mũi và định hình mũi",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  assert.match(resShape.translatedText, /Tip shape/i);
  assert.match(resShape.translatedText, /Tip shaping/i);
  assert.doesNotMatch(resShape.translatedText, /Shape tip/i);
  assert.doesNotMatch(resShape.translatedText, /Định hình Tip/i);
});

test("Reverse Translation - VI to EN prevents stitch terms from being mistranslated to Tip", async () => {
  const provider = new AirGappedTranslationProvider();
  const approved = db.getApprovedTerminology("vi", "en");

  const resStitch = await provider.translate({
    sourceText: "Kiểm tra số mũi kim và mũi chỉ không đứt",
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  assert.doesNotMatch(resStitch.translatedText, /Tip thread/i);
  assert.doesNotMatch(resStitch.translatedText, /Số Tip/i);
  assert.match(resStitch.translatedText, /needle stitch count|stitch/i);
});

