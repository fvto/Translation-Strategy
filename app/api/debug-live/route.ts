import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DEBUG_FILE = path.join(process.cwd(), "data", "debug_live.json");
const MAX_EVENTS = 100;

interface DebugEvent {
  id: string;
  type: "error" | "unhandledrejection" | "fetch_error" | "warn" | "action";
  message: string;
  source?: string;
  stack?: string;
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  payload?: any;
  responsePreview?: string;
  breadcrumbs?: Array<{ action: string; target?: string; timestamp: string }>;
  timestamp: string;
}

interface DebugStorage {
  lastUpdated: string;
  errorCount: number;
  events: DebugEvent[];
}

function readLogs(): DebugStorage {
  try {
    if (fs.existsSync(DEBUG_FILE)) {
      const raw = fs.readFileSync(DEBUG_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (_) {}
  return {
    lastUpdated: new Date().toISOString(),
    errorCount: 0,
    events: [],
  };
}

function writeLogs(data: DebugStorage) {
  try {
    const dir = path.dirname(DEBUG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DEBUG_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[DebugLiveAPI] Failed to save debug logs:", err);
  }
}

export async function GET() {
  const data = readLogs();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event: DebugEvent = {
      id: "dbg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      type: body.type || "error",
      message: String(body.message || "Unknown error"),
      source: body.source,
      stack: body.stack,
      url: body.url,
      method: body.method,
      status: body.status,
      statusText: body.statusText,
      payload: body.payload,
      responsePreview: body.responsePreview,
      breadcrumbs: body.breadcrumbs || [],
      timestamp: body.timestamp || new Date().toISOString(),
    };

    const current = readLogs();
    current.events.unshift(event);
    if (current.events.length > MAX_EVENTS) {
      current.events = current.events.slice(0, MAX_EVENTS);
    }

    if (["error", "unhandledrejection", "fetch_error"].includes(event.type)) {
      current.errorCount = (current.errorCount || 0) + 1;
    }
    current.lastUpdated = new Date().toISOString();

    writeLogs(current);

    return NextResponse.json({ success: true, eventId: event.id, totalErrors: current.errorCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  const fresh: DebugStorage = {
    lastUpdated: new Date().toISOString(),
    errorCount: 0,
    events: [],
  };
  writeLogs(fresh);
  return NextResponse.json({ success: true, message: "Debug logs reset" });
}
