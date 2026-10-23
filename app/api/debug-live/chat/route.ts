import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";
import fs from "fs";
import path from "path";

const DEBUG_FILE = path.join(process.cwd(), "data", "debug_live.json");

function getApiKey(): string | undefined {
  const settings = db.getSettings();
  return (
    settings.geminiApiKey ||
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY
  );
}

function appendChatLog(userMsg: string, aiReply: string) {
  try {
    if (fs.existsSync(DEBUG_FILE)) {
      const raw = fs.readFileSync(DEBUG_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (!data.chatHistory) data.chatHistory = [];
      data.chatHistory.push({
        timestamp: new Date().toISOString(),
        user: userMsg,
        assistant: aiReply,
      });
      // Keep last 30 chat messages
      if (data.chatHistory.length > 30) {
        data.chatHistory = data.chatHistory.slice(-30);
      }
      fs.writeFileSync(DEBUG_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch (_) {}
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], context = {} } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const apiKey = getApiKey();
    const recentErrors = context.recentErrors || [];
    const breadcrumbs = context.breadcrumbs || [];

    const systemPrompt = `Bạn là Trợ lý AI Kỹ thuật kiêm Copilot nội bộ của hệ thống Secure Translator (Ching Luh Footwear SOP & CAT System).
Nhiệm vụ của bạn:
1. Hỗ trợ người dùng kiểm tra lỗi (bug), giải thích các mã lỗi HTTP/React, chẩn đoán nguyên nhân khi thao tác trên web.
2. Trả lời các thắc mắc về quy chuẩn dịch thuật SOP Ching Luh (Zero Vietnamese Leakage, quy tắc SPI, No-sew, Tip-quarter, CTQ inspection criteria).
3. Hướng dẫn người dùng các bước tiếp theo ngắn gọn, trực diện, bằng Tiếng Việt.

BỐI CẢNH HIỆN TẠI TRÊN MÀN HÌNH NGƯỜI DÙNG:
- Lỗi vừa phát hiện trên màn hình (${recentErrors.length} lỗi):
${JSON.stringify(recentErrors.slice(0, 3), null, 2)}
- Thao tác gần nhất của người dùng (Breadcrumbs):
${JSON.stringify(breadcrumbs.slice(-5), null, 2)}
`;

    if (apiKey) {
      const model = "gemini-2.5-flash";
      const contents: any[] = [
        {
          role: "user",
          parts: [{ text: `[HỆ THỐNG / BỐI CẢNH]:\n${systemPrompt}` }],
        },
        {
          role: "model",
          parts: [{ text: "Đã hiểu bối cảnh và quy chuẩn hệ thống. Tôi sẵn sàng hỗ trợ." }],
        },
      ];

      // Append up to last 6 chat history messages
      for (const h of history.slice(-6)) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        });
      }

      contents.push({
        role: "user",
        parts: [{ text: message }],
      });

      // Try calling Gemini models with fallback
      const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-3.5-flash-lite"];
      let replyText = "";

      for (const m of candidateModels) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents,
                generationConfig: {
                  temperature: 0.3,
                  maxOutputTokens: 1000,
                },
              }),
            }
          );

          if (res.ok) {
            const json = await res.json();
            replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (replyText) break;
          }
        } catch (_) {}
      }

      if (replyText) {
        appendChatLog(message, replyText);
        return NextResponse.json({ reply: replyText });
      }
    }

    // Fallback if no API key or external call fails
    let fallbackReply = "";
    if (recentErrors.length > 0) {
      const lastErr = recentErrors[0];
      fallbackReply = `🔍 **Chẩn đoán nhanh lỗi hiện tại:**\n- **Thông điệp:** \`${lastErr.message || "Unknown error"}\`\n- **Chi tiết:** ${lastErr.url ? `Lỗi xảy ra tại endpoint \`${lastErr.url}\` (Status: ${lastErr.status || 500})` : "Lỗi JavaScript runtime trên giao diện."}\n- **Đề xuất:** Hãy kiểm tra lại kết nối mạng hoặc báo với Antigravity IDE để được vá trực tiếp vào file nguồn!`;
    } else {
      fallbackReply = `Chào bạn! Tôi đang theo dõi phiên làm việc này. Hiện tại hệ thống ghi nhận **không có lỗi nào** phát sinh. Bạn có thể hỏi tôi về quy chuẩn dịch thuật SOP Ching Luh, hoặc tiếp tục thao tác trên giao diện web.`;
    }

    appendChatLog(message, fallbackReply);
    return NextResponse.json({ reply: fallbackReply });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
