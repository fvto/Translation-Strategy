import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const TEMP_DIR = path.resolve(process.cwd(), "data", "secure_storage");

/**
 * Reads a PPTX file using Microsoft MarkItDown (via Python bridge)
 * to extract structured Markdown representation.
 */
export async function readPptxWithMarkItDown(
  buffer: Buffer
): Promise<{ markdown: string; title?: string; success: boolean }> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const tempFileName = `markitdown_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.pptx`;
  const tempFilePath = path.join(TEMP_DIR, tempFileName);
  const scriptPath = path.resolve(process.cwd(), "scripts", "markitdown_reader.py");

  try {
    fs.writeFileSync(tempFilePath, buffer);

    return await new Promise((resolve) => {
      const pythonProcess = spawn("python", [scriptPath, tempFilePath], {
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString("utf-8");
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString("utf-8");
      });

      pythonProcess.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.markdown) {
              resolve({
                markdown: parsed.markdown,
                title: parsed.title,
                success: true,
              });
              return;
            }
          } catch (e) {
            console.warn("Failed to parse MarkItDown JSON output:", e);
          }
        }

        console.warn("MarkItDown process completed with warning/fallback:", stderr || stdout);
        resolve({
          markdown: "",
          success: false,
        });
      });

      pythonProcess.on("error", (err) => {
        console.warn("Could not spawn Python for MarkItDown:", err.message);
        resolve({
          markdown: "",
          success: false,
        });
      });
    });
  } catch (err) {
    console.warn("Error running MarkItDown:", err);
    return { markdown: "", success: false };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
}
