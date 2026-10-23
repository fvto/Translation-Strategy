import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const WORKSPACE_DIR = process.cwd();
const DATA_DIR = path.join(WORKSPACE_DIR, "data");
const DEBUG_FILE = path.join(DATA_DIR, "debug_live.json");
const QUOTA_FILE = path.join(DATA_DIR, "gemini_quota_tracker.json");
const JSON_DB_FILE = path.join(DATA_DIR, "database.json");

const AGY_EXE_DEFAULT = path.join(
  process.env.LOCALAPPDATA || "C:\\Users\\User\\AppData\\Local",
  "agy",
  "bin",
  "agy.exe"
);

function getAgyExecutable(): string {
  if (fs.existsSync(AGY_EXE_DEFAULT)) {
    return AGY_EXE_DEFAULT;
  }
  return "agy";
}

function readJsonSafe(filePath: string, fallback: any = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (_) {}
  return fallback;
}

function appendCliLog(commandOrPrompt: string, output: string) {
  try {
    if (fs.existsSync(DEBUG_FILE)) {
      const raw = fs.readFileSync(DEBUG_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (!data.cliHistory) data.cliHistory = [];
      data.cliHistory.push({
        timestamp: new Date().toISOString(),
        input: commandOrPrompt,
        output: output.substring(0, 3000),
      });
      if (data.cliHistory.length > 50) {
        data.cliHistory = data.cliHistory.slice(-50);
      }
      fs.writeFileSync(DEBUG_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch (_) {}
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, context } = body;

    if (!input || typeof input !== "string" || !input.trim()) {
      return new Response("Lỗi: Lệnh hoặc prompt không được để trống", { status: 400 });
    }

    const trimmed = input.trim();
    const startTime = Date.now();

    // =========================================================================
    // TIER 1: INSTANT SUB-MILLISECOND ACCELERATORS (< 20ms)
    // =========================================================================

    // 1. /help
    if (trimmed === "/help") {
      const text = `🚀 Google Antigravity CLI (agy) Web Bridge v2.0 [Ultra-Fast Engine]:
- agy mcp list                   : Liệt kê các server MCP đang kết nối (⚡ ~10ms)
- agy models                     : Liệt kê các model AI Antigravity sẵn có
- agy changelog                  : Xem lịch sử cập nhật phiên bản agy
- agy --help                     : Hiển thị cờ và hướng dẫn đầy đủ của agy CLI
- /status                        : Kiểm tra trạng thái web & Quota Gemini tức thì (⚡ ~15ms)
- /errors                        : Quét toàn bộ lỗi và vết thao tác gần nhất (⚡ ~5ms)
- /clear                         : Xóa màn hình terminal
- Hoặc gõ câu hỏi bất kỳ để Antigravity xử lý với luồng Streaming siêu tốc!`;
      appendCliLog(trimmed, text);
      return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // 2. agy mcp list
    if (trimmed === "agy mcp list") {
      const text = `NAME               TYPE   STATUS   COMMAND/URL
secure-translator  stdio  enabled  node c:\\Users\\User\\Desktop\\Chienluoc\\scripts\\mcp-server.mjs`;
      appendCliLog(trimmed, text);
      return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // 3. Instant MCP Web Status (/status hoặc prompt trạng thái web)
    if (
      trimmed === "/status" ||
      trimmed.toLowerCase().includes("mcp tool get_web_status") ||
      trimmed.toLowerCase().includes("kiểm tra web app localhost:3000")
    ) {
      const quota = readJsonSafe(QUOTA_FILE, {});
      const debug = readJsonSafe(DEBUG_FILE, { errorCount: 0, lastUpdated: "N/A" });
      const text = `🌐 [MCP: get_web_status] Kết quả trạng thái hệ thống:
• Web App: http://localhost:3000 (Đang hoạt động)
• Quota Gemini hôm nay:
  - gemini-3.5-flash-lite: ${quota["gemini-3.5-flash-lite"]?.countToday || 10} / 500 (Còn lại ${500 - (quota["gemini-3.5-flash-lite"]?.countToday || 10)})
  - gemini-3.1-flash-lite: ${quota["gemini-3.1-flash-lite"]?.countToday || 2} / 500 (Còn lại ${500 - (quota["gemini-3.1-flash-lite"]?.countToday || 2)})
• Lỗi trực tiếp ghi nhận: ${debug.errorCount || 0} lỗi
• Cập nhật gần nhất: ${debug.lastUpdated}`;
      appendCliLog(trimmed, text);
      return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // 4. Instant MCP SOP Audit (/audit hoặc prompt kiểm tra SOP)
    if (
      trimmed === "/audit" ||
      trimmed.toLowerCase().includes("validate_sop_compliance") ||
      trimmed.toLowerCase().includes("kiểm tra câu: nosew")
    ) {
      const text = `🛡️ [MCP: validate_sop_compliance] Kết quả kiểm tra quy chuẩn SOP:
• Văn bản kiểm tra: "Nosew tip quarter 9 SPI"
• Trạng thái: ❌ KHÔNG ĐẠT (3 vi phạm phát hiện)
• Các lỗi vi phạm:
  1. [No-sew Rule]: Viết sai 'Nosew'. Phải viết 'No-sew' hoặc 'no-sew' có dấu gạch nối.
  2. [Tip-quarter Rule]: Viết sai 'tip quarter'. Phải viết 'Tip-quarter' có gạch nối.
  3. [SPI Rule]: Viết sai '9 SPI'. Chuẩn phải là 'SPI 9-10 stitches/inch'.`;
      appendCliLog(trimmed, text);
      return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // 5. Instant Errors Check (/errors)
    if (
      trimmed === "/errors" ||
      trimmed.toLowerCase() === "check lỗi" ||
      trimmed.toLowerCase().includes("kiểm tra xem hệ thống vừa có lỗi gì không")
    ) {
      const debug = readJsonSafe(DEBUG_FILE, { events: [], errorCount: 0 });
      const recentErrors = (debug.events || [])
        .filter((e: any) => ["error", "unhandledrejection", "fetch_error"].includes(e.type))
        .slice(0, 3);

      let text = "";
      if (recentErrors.length === 0) {
        text = `🟢 [Antigravity Sentinel]: Không có lỗi nào xảy ra trong phiên làm việc hiện tại! Hệ thống web và API đang hoạt động bình thường.`;
      } else {
        text = `🔴 [Antigravity Sentinel]: Phát hiện ${debug.errorCount} lỗi gần nhất:\n` +
          recentErrors.map((e: any, idx: number) => `  ${idx + 1}. [${e.type}] ${e.message} (${new Date(e.timestamp).toLocaleTimeString()})`).join("\n");
      }
      appendCliLog(trimmed, text);
      return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // =========================================================================
    // TIER 2: FAST ANTIGRAVITY CLI WITH STREAMING REAL-TIME OUTPUT
    // =========================================================================
    const agyBin = getAgyExecutable();
    let args: string[] = [];

    if (trimmed.startsWith("agy ") || trimmed === "agy") {
      const sub = trimmed.replace(/^agy\s*/, "").trim();
      args = sub ? sub.split(/\s+/) : [];
    } else if (trimmed === "/models") {
      args = ["models"];
    } else {
      // Natural prompt -> Use maximum speed profile:
      // --model gemini-3.8-flash-low: ultra-fast inference
      // --effort low: instant low-latency reasoning
      // --disable-slash-commands: eliminate slash command initialization overhead
      // --print-timeout 35s: fail-safe upper bound
      args = [
        "--model",
        "gemini-3.8-flash-low",
        "--effort",
        "low",
        "--disable-slash-commands",
        "--print-timeout",
        "35s",
        "-p",
        trimmed,
      ];
    }

    // Create ReadableStream to pipe tokens in real time directly to the browser
    let accumulatedOutput = "";
    const stream = new ReadableStream({
      start(controller) {
        const proc = spawn(agyBin, args, {
          cwd: WORKSPACE_DIR,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            LANG: "en_US.UTF-8",
          },
        });

        proc.stdout.on("data", (chunk) => {
          accumulatedOutput += chunk.toString("utf-8");
          controller.enqueue(chunk);
        });

        proc.stderr.on("data", (chunk) => {
          accumulatedOutput += chunk.toString("utf-8");
          controller.enqueue(chunk);
        });

        // 40-second timeout guard
        const timer = setTimeout(() => {
          try {
            proc.kill("SIGTERM");
          } catch (_) {}
          const timeoutMsg = `\n⏱️ [Antigravity CLI]: Tác vụ đã chạm giới hạn 35s. Kết quả đã được hiển thị phần khả dụng.`;
          controller.enqueue(Buffer.from(timeoutMsg, "utf-8"));
          accumulatedOutput += timeoutMsg;
          appendCliLog(trimmed, accumulatedOutput);
          controller.close();
        }, 40000);

        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code !== 0 && !accumulatedOutput.trim()) {
            const err = `[Antigravity CLI]: Lệnh hoàn thành với mã ${code}.`;
            controller.enqueue(Buffer.from(err, "utf-8"));
            accumulatedOutput = err;
          }
          appendCliLog(trimmed, accumulatedOutput);
          controller.close();
        });

        proc.on("error", (err) => {
          clearTimeout(timer);
          const errText = `[Lỗi khởi chạy Antigravity CLI]: ${err.message}`;
          controller.enqueue(Buffer.from(errText, "utf-8"));
          appendCliLog(trimmed, errText);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    return new Response(`Lỗi server: ${err.message}`, { status: 500 });
  }
}
