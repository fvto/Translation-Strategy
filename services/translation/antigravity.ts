import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from "./types";
import { buildStructuredPrompt } from "./context";
import { normalizeSpiTerminology } from "./casing";
import { enforceTerminologyCompliance } from "../terminology/enforcer";
import { AirGappedTranslationProvider } from "./offline";
import { verifyConciseness, extractEntities, isConciseModeEligible } from "./concise-sop";

export class AntigravityAuthRequiredError extends Error {
  readonly code = "ANTIGRAVITY_AUTH_REQUIRED";
  readonly authUrl?: string;

  constructor(message: string, authUrl?: string) {
    super(message);
    this.name = "AntigravityAuthRequiredError";
    this.authUrl = authUrl;
  }
}

export interface TermSuggestionResult {
  sourceTerm: string;
  targetTerm: string;
  category?: string;
  definition?: string;
  confidence: number;
  provider: string;
  notes?: string;
  isFallback?: boolean;
}

export class AntigravityCliTranslationProvider implements TranslationProvider {
  name = "antigravity_cli";
  private cliPath: string;
  private fallbackProvider = new AirGappedTranslationProvider();

  constructor(customPath?: string) {
    this.cliPath = customPath || this.resolveBinaryPath();
  }

  /**
   * Resolves the path to the agy executable without requiring admin rights.
   */
  resolveBinaryPath(): string {
    if (process.env.ANTIGRAVITY_CLI_PATH && fs.existsSync(process.env.ANTIGRAVITY_CLI_PATH)) {
      return process.env.ANTIGRAVITY_CLI_PATH;
    }

    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const defaultUserPath = path.join(localAppData, "agy", "bin", "agy.exe");
      if (fs.existsSync(defaultUserPath)) {
        return defaultUserPath;
      }
    }

    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      const fallbackUserPath = path.join(userProfile, "AppData", "Local", "agy", "bin", "agy.exe");
      if (fs.existsSync(fallbackUserPath)) {
        return fallbackUserPath;
      }
    }

    return "agy";
  }

  /**
   * Runs the agy CLI with the given prompt and timeout.
   */
  private runAgyPrompt(prompt: string, timeoutMs: number = 45_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "-p",
        prompt,
        "--disable-slash-commands",
        "--dangerously-skip-permissions",
      ];

      const child = spawn(this.cliPath, args, {
        windowsHide: true,
        env: {
          ...process.env,
          // Ensure UTF-8 output encoding
          PYTHONIOENCODING: "utf-8",
        },
      });

      let stdout = "";
      let stderr = "";
      let authUrlDetected: string | undefined;

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Antigravity CLI timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf-8");
        stdout += text;

        if (text.includes("Authentication required. Please visit the URL to log in:")) {
          const match = text.match(/https:\/\/accounts\.google\.com\/[^\s]+/);
          if (match) authUrlDetected = match[0];
          clearTimeout(timer);
          child.kill();
          reject(
            new AntigravityAuthRequiredError(
              "Antigravity CLI chưa đăng nhập. Vui lòng mở PowerShell hoặc Command Prompt và gõ 'agy' để xác thực tài khoản Google.",
              authUrlDetected
            )
          );
        }
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf-8");
        stderr += text;

        if (text.includes("Authentication required. Please visit the URL to log in:")) {
          const match = text.match(/https:\/\/accounts\.google\.com\/[^\s]+/);
          if (match) authUrlDetected = match[0];
          clearTimeout(timer);
          child.kill();
          reject(
            new AntigravityAuthRequiredError(
              "Antigravity CLI chưa đăng nhập. Vui lòng mở PowerShell hoặc Command Prompt và gõ 'agy' để xác thực tài khoản Google.",
              authUrlDetected
            )
          );
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Không thể khởi chạy Antigravity CLI (${this.cliPath}): ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`Antigravity CLI thoát với mã lỗi ${code}: ${stderr.trim()}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Suggests context-aware terminology for the Glossary Review system.
   */
  async suggestTerm(
    sourceTerm: string,
    context?: string,
    sourceLanguage: string = "en",
    targetLanguage: string = "vi"
  ): Promise<TermSuggestionResult> {
    const isEnToVi = sourceLanguage.toLowerCase().startsWith("en");

    // Construct footwear domain prompt
    const domainPrompt = `You are the lead footwear engineering and quality assurance translator for Ching Luh / Nike production operations.
Task: Provide the precise, standardized technical translation for the following glossary term within its manufacturing context.

Source Term: "${sourceTerm}"
Context / Standard: "${context || "Footwear Manufacturing SOP / IPQC / ISQ"}"
Source Language: ${sourceLanguage.toUpperCase()}
Target Language: ${targetLanguage.toUpperCase()}

STRICT DOMAIN RULES:
1. Footwear Component Ordering:
   - For quality inspection criteria (CTQ), attributes like "Hình dạng [bộ vị]" MUST use English noun adjunct order: "[Component] shape" (e.g. "Tip shape", "Toe shape", "Collar shape", "Heel shape"). NEVER use verb phrases like "Shape tip".
2. Stitch Density (SPI):
   - Stitch counts like "10-12 mũi/inch", "9-10 mũi", "7-8 mũi" MUST be translated as "SPI <number> stitches/inch" (e.g. "SPI 10-12 stitches/inch", "SPI 9-10 stitches/inch").
3. Process Terminology:
   - "phun keo và dán mos/mút" -> "*Spray cement and attach cement foam" (always "attach", NEVER "apply" or typo "aplly").
   - "định hình lạnh" -> "cold molding / cold shaping".
   - "lập thể nổi đều" -> "consistent deboss / 3D emboss".
4. QA Tolerance & Surface Geometry:
   - "không bằng phẳng chấp nhận mức độ tiêu chuẩn..." -> "Due to the uneven surface design of [component], quality standard tolerances are acceptable for [defect]...". NEVER translate as "[flat] does not accept".
5. Category: Provide appropriate footwear category (e.g. "Footwear Construction", "Quality Criteria", "Stitching", "Assembly", "Finishing", "Tooling").

Return ONLY a JSON object with this exact format:
{
  "targetTerm": "<precise translated term>",
  "category": "<footwear category>",
  "definition": "<short explanation or standard definition>",
  "confidence": 0.95,
  "notes": "<optional manufacturing note>"
}`;

    try {
      const output = await this.runAgyPrompt(domainPrompt, 30_000);
      const cleanJson = output.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();

      let parsed: any = null;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const match = cleanJson.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && typeof parsed.targetTerm === "string" && parsed.targetTerm.trim()) {
        const targetClean = normalizeSpiTerminology(parsed.targetTerm.trim());
        return {
          sourceTerm,
          targetTerm: targetClean,
          category: parsed.category || "Footwear Engineering",
          definition: parsed.definition || undefined,
          confidence: parsed.confidence || 0.95,
          provider: "Antigravity CLI (agy)",
          notes: parsed.notes || undefined,
          isFallback: false,
        };
      }
    } catch (err: any) {
      // Fallback to local dictionary / air-gapped engine
      const fallbackResult = await this.fallbackProvider.translate({
        sourceText: sourceTerm,
        sourceLanguage,
        targetLanguage,
        approvedTerminology: [],
        context,
      });

      return {
        sourceTerm,
        targetTerm: fallbackResult.translatedText,
        category: "Footwear Manufacturing",
        confidence: 0.8,
        provider: "Offline Dictionary (Fallback)",
        notes: err instanceof AntigravityAuthRequiredError ? err.message : `CLI Notice: ${err.message}`,
        isFallback: true,
      };
    }

    // Default fallback if parsing fails
    return {
      sourceTerm,
      targetTerm: sourceTerm,
      confidence: 0.5,
      provider: "Antigravity CLI (agy)",
      isFallback: true,
    };
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = Date.now();

    // ─── Zero-Loss Concise Mode Gate ────────────────────────────────────────
    // Determine eligibility once, outside try block
    const isViSource = request.sourceLanguage?.toLowerCase().startsWith("vi");
    const extraction = isViSource ? extractEntities(request.sourceText) : null;
    const { eligible: conciseEligible } = extraction
      ? isConciseModeEligible(request.sourceText, extraction)
      : { eligible: false };

    // Standard (full) prompt — always the safety fallback
    const { systemPrompt: stdSystem, userPrompt } = buildStructuredPrompt(request, false);
    const fullPrompt = `${stdSystem}\n\n${userPrompt}`;

    try {
      let finalText: string;

      if (conciseEligible) {
        // Run concise-mode and full-mode in parallel for speed
        const { systemPrompt: conciseSystem } = buildStructuredPrompt(request, true);
        const concisePrompt = `${conciseSystem}\n\n${userPrompt}`;

        const [conciseRaw, fullRaw] = await Promise.all([
          this.runAgyPrompt(concisePrompt, 45_000),
          this.runAgyPrompt(fullPrompt, 45_000),
        ]);

        const conciseClean = normalizeSpiTerminology(
          conciseRaw.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim()
        );
        const fullClean = normalizeSpiTerminology(
          fullRaw.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim()
        );

        // Zero-loss verification: auto-rollback if concise output drops any critical entity
        const verification = verifyConciseness(request.sourceText, conciseClean, fullClean);
        if (verification.rolledBack) {
          console.warn(
            `[AntigravityProvider] Concise rollback on slide segment — ${verification.eligibilityReason}`
          );
        }
        finalText = verification.finalText;
      } else {
        // Not eligible for concise mode — use standard full translation
        const rawOutput = await this.runAgyPrompt(fullPrompt, 45_000);
        finalText = normalizeSpiTerminology(
          rawOutput.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim()
        );
      }

      const enforced = enforceTerminologyCompliance(
        request.sourceText,
        finalText,
        request.approvedTerminology || [],
        request.sourceLanguage,
        request.targetLanguage
      );

      return {
        translatedText: enforced.text,
        provider: "Antigravity CLI (agy)",
        durationMs: Date.now() - startTime,
        modelName: "agy",
      };
    } catch (err: any) {
      if (err instanceof AntigravityAuthRequiredError) {
        throw err;
      }
      // Failover to air-gapped provider if CLI encounters issue
      return this.fallbackProvider.translate(request);
    }
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const startTime = Date.now();
    const results = new Map<string, string>();

    if (!request.items || request.items.length === 0) {
      return {
        results,
        provider: "Antigravity CLI (agy)",
        durationMs: 0,
        modelName: "agy",
      };
    }

    // Filter relevant glossary terms
    let glossaryGuide = "";
    if (request.approvedTerminology && request.approvedTerminology.length > 0) {
      const combinedLower = request.items.map((it) => it.sourceText).join(" ").toLowerCase();
      const relevant = request.approvedTerminology
        .filter((t) => t.sourceTerm && combinedLower.includes(t.sourceTerm.toLowerCase()))
        .slice(0, 35);
      if (relevant.length > 0) {
        glossaryGuide = `DOMAIN GLOSSARY REFERENCE (GUIDELINE / THAM KHẢO - NOT 100% FORCED):\nUse the following approved footwear terminology as a reference for domain consistency:\n${relevant
          .map((t) => `- "${t.sourceTerm}" -> "${t.targetTerm}"`)
          .join("\n")}\nApply naturally according to sentence context without forcing rigid word-for-word replacement.\n`;
      }
    }

    const promptItems = request.items.map((it) => ({
      id: it.id,
      sourceText: it.sourceText,
    }));

    const batchPrompt = `You are a professional athletic footwear manufacturing quality assurance translator for Ching Luh / Nike production manuals (IPQC/ISQ).
Translate each item accurately from ${request.sourceLanguage.toUpperCase()} to ${request.targetLanguage.toUpperCase()}.
${glossaryGuide}
Key domain translation guidelines:
- Footwear construction: "mặt trước" -> "vamp", "mặt giày" -> "upper", "lót vòng cổ" -> "collar lining", "vòng cổ" -> "collar opening", "lưỡi gà" -> "tongue", "gót" -> "heel", "ô dê" -> "eyestay", "eo ngoài" -> "lateral / lat", "eo trong" -> "medial / med", "phom" -> "last", "đế trung" -> "midsole", "đế ngoài" -> "outsole", "bộ vị" -> "component / part".
- Stitch density (SPI): "mũi/inch" or stitch count ranges MUST be translated as "SPI <number> stitches/inch" (e.g. "SPI 10-12 stitches/inch", "SPI 9-10 stitches/inch", "SPI 7-8 stitches/inch"). The strictly required format is "SPI <number> stitches/inch".
- Processes & Defects: "lập thể nổi đều" -> "consistent deboss / 3D emboss", "độ bo mũi" -> "toe curve", "mũi/gót thẳng hàng" -> "toe/heel alignment", "cách biên" -> "margin", "cách kim" -> "stitch spacing / SPI", "vô phom" -> "lasting", "định hình lạnh" -> "cold molding / cold shaping", "dập bằng" -> "hammering flat", "phun keo và dán mos" / "phun keo và dán mút" -> "*Spray cement and attach cement foam", "dán mos" / "dán mút" -> "attach cement foam" (always use "attach", NEVER "apply" or typo "aplly"), "lộn chân" -> "swapped feet".
- Grammatical Noun-Phrase Ordering for Inspection Criteria / CTQ: In footwear inspection headings, attributes like "Hình dạng [bộ vị]" MUST be translated with English noun adjunct ordering "[Component] shape" (e.g. "Hình dạng mũi" -> "Tip shape" / "Toe shape", NEVER "Shape tip"; "Hình dạng gót" -> "Heel shape"; "Hình dạng vòng cổ" -> "Collar shape").
- Headings: Process titles starting with '*' mark top-level process sections; NEVER create or duplicate process headings inside numbered lists.
- Preserve all dimensions, temperatures, fractions, acronyms, and codes.
Return strictly a valid JSON array of objects with keys "id" and "translatedText":
Input:
${JSON.stringify(promptItems, null, 2)}`;

    try {
      const rawOutput = await this.runAgyPrompt(batchPrompt, 60_000);
      const cleanJson = rawOutput.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();

      let parsed: any = null;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const match = cleanJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const text = item.translatedText ?? item.text ?? item.translation ?? item.targetText;
          if (item.id && typeof text === "string") {
            const sourceItem = request.items.find((x) => x.id === item.id);
            const enforced = sourceItem
              ? enforceTerminologyCompliance(
                  sourceItem.sourceText,
                  text,
                  request.approvedTerminology || [],
                  request.sourceLanguage,
                  request.targetLanguage
                ).text
              : normalizeSpiTerminology(text).trim();
            results.set(item.id, enforced);
          }
        }
      }

      return {
        results,
        provider: "Antigravity CLI (agy)",
        durationMs: Date.now() - startTime,
        modelName: "agy",
      };
    } catch (err: any) {
      for (const it of request.items) {
        const single = await this.fallbackProvider.translate({
          sourceText: it.sourceText,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          approvedTerminology: request.approvedTerminology,
          context: request.context,
        });
        results.set(it.id, single.translatedText);
      }
      return {
        results,
        provider: "Air-Gapped CAT (Fallback)",
        durationMs: Date.now() - startTime,
        modelName: "offline",
      };
    }
  }
}
