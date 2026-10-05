import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from "./types";
import { normalizeSourcePunctuation } from "./casing";
import { enforceTerminologyCompliance } from "../terminology/enforcer";

export class CTranslate2TranslationProvider implements TranslationProvider {
  name = "ctranslate2";
  private scriptPath: string;

  constructor(customScriptPath?: string) {
    this.scriptPath =
      customScriptPath ||
      path.resolve(process.cwd(), "scripts", "local_nmt_translator.py");
  }

  private runPythonTranslator(
    items: { id: string; text: string; src?: string; tgt?: string }[]
  ): Promise<Map<string, string>> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.scriptPath)) {
        return reject(
          new Error(`Local NMT script not found at ${this.scriptPath}`)
        );
      }

      const child = spawn("python", [this.scriptPath], {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      });

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("CTranslate2 translation timed out after 60s"));
      }, 60000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0 && stdout.trim()) {
          try {
            const raw = stdout.trim();
            const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              const resMap = new Map<string, string>();
              for (const item of parsed) {
                if (item.id && typeof item.translatedText === "string") {
                  resMap.set(item.id, item.translatedText.trim());
                }
              }
              return resolve(resMap);
            }
          } catch (err) {
            return reject(new Error(`Failed to parse CTranslate2 JSON: ${err}`));
          }
        }
        reject(
          new Error(
            `CTranslate2 exited with code ${code}. Error: ${stderr || "Unknown"}`
          )
        );
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.stdin.write(JSON.stringify(items));
      child.stdin.end();
    });
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();
    const sourceText = normalizeSourcePunctuation(request.sourceText);

    const src = request.sourceLanguage === "vi" ? "vie_Latn" : "eng_Latn";
    const tgt = request.targetLanguage === "vi" ? "vie_Latn" : "eng_Latn";

    let translatedText = "";

    const lines = sourceText.split(/\r?\n/);
    if (lines.length > 1) {
      const items = lines.map((line, idx) => ({
        id: String(idx),
        text: line.trim() ? line : " ",
        src,
        tgt,
      }));
      const resultMap = await this.runPythonTranslator(items);
      translatedText = lines
        .map((orig, idx) => (orig.trim() ? resultMap.get(String(idx)) || orig : ""))
        .join("\n");
    } else {
      const resultMap = await this.runPythonTranslator([
        { id: "single_item", text: sourceText, src, tgt },
      ]);
      translatedText = resultMap.get("single_item") || sourceText;
    }

    if (request.approvedTerminology && request.approvedTerminology.length > 0) {
      const enforcement = enforceTerminologyCompliance(
        sourceText,
        translatedText,
        request.approvedTerminology
      );
      translatedText = enforcement.text;
    }

    return {
      translatedText,
      provider: this.name,
      durationMs: Date.now() - startTime,
      modelName: "NLLB-200-distilled-600M (CTranslate2 INT8)",
    };
  }

  async translateBatch(
    request: BatchTranslationRequest
  ): Promise<BatchTranslationResponse> {
    const startTime = Date.now();
    const src = request.sourceLanguage === "vi" ? "vie_Latn" : "eng_Latn";
    const tgt = request.targetLanguage === "vi" ? "vie_Latn" : "eng_Latn";
    const items = request.items.map((it) => ({
      id: it.id,
      text: normalizeSourcePunctuation(it.sourceText),
      src,
      tgt
    }));

    const results = await this.runPythonTranslator(items);

    if (request.approvedTerminology && request.approvedTerminology.length > 0) {
      for (const item of request.items) {
        const raw = results.get(item.id);
        if (raw) {
          const enforced = enforceTerminologyCompliance(
            item.sourceText,
            raw,
            request.approvedTerminology
          );
          results.set(item.id, enforced.text);
        }
      }
    }

    return {
      results,
      provider: this.name,
      durationMs: Date.now() - startTime,
      modelName: "NLLB-200-distilled-600M (CTranslate2 INT8)",
    };
  }
}
