import { LocalLLMProvider } from "./services/translation/local.js";
import { db } from "./services/database/db.js";

async function run() {
  const provider = new LocalLLMProvider("http://127.0.0.1:11434/v1", "qwen3:4b");
  const approved = db.getApprovedTerminology("vi", "en");

  const sample = `3. Kiểm tra dao chặt và thớt chặt phải đúng tiêu chuẩn`;

  console.log("Translating with LocalLLMProvider (qwen3:4b)...");
  const start = Date.now();
  const res = await provider.translate({
    sourceText: sample,
    sourceLanguage: "vi",
    targetLanguage: "en",
    approvedTerminology: approved,
  });

  console.log("Success in", (Date.now() - start), "ms");
  console.log("Provider:", res.provider);
  console.log("Model:", res.modelName);
  console.log("Translated text:\n", res.translatedText);
}
run();
