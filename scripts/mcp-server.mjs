#!/usr/bin/env node

/**
 * Secure Translator Model Context Protocol (MCP) Server
 * Enables Antigravity CLI (agy) to directly inspect, query, and control
 * the Secure Translator web application, its live debug state, glossary,
 * and SOP compliance rules.
 */

import readline from "readline";
import fs from "fs";
import path from "path";

const WORKSPACE_DIR = process.cwd();
const DATA_DIR = path.join(WORKSPACE_DIR, "data");
const DEBUG_FILE = path.join(DATA_DIR, "debug_live.json");
const SQLITE_FILE = path.join(DATA_DIR, "database.sqlite");
const JSON_DB_FILE = path.join(DATA_DIR, "database.json");
const QUOTA_FILE = path.join(DATA_DIR, "gemini_quota_tracker.json");

// Safe file readers
function readJsonSafe(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (_) {}
  return fallback;
}

// Tool implementations
async function getWebStatus() {
  let isWebRunning = false;
  let webSettings = null;

  try {
    const res = await fetch("http://localhost:3000/api/settings", { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      isWebRunning = true;
      webSettings = await res.json();
    }
  } catch (_) {}

  const quota = readJsonSafe(QUOTA_FILE, {});
  const debug = readJsonSafe(DEBUG_FILE, { errorCount: 0 });

  return {
    webUrl: "http://localhost:3000",
    isWebRunning,
    activeProvider: webSettings?.settings?.defaultProvider || "gemini",
    geminiModel: webSettings?.settings?.geminiModel || "gemini-3.5-flash-lite",
    totalLiveErrorsDetected: debug.errorCount || 0,
    quotaUsage: quota,
    lastDebugUpdate: debug.lastUpdated || "N/A",
  };
}

function getLiveDebugErrors(args) {
  const limit = args?.limit || 5;
  const debug = readJsonSafe(DEBUG_FILE, { events: [], errorCount: 0 });
  const errors = (debug.events || [])
    .filter((e) => ["error", "unhandledrejection", "fetch_error"].includes(e.type))
    .slice(0, limit);

  return {
    totalErrors: debug.errorCount || 0,
    recentErrors: errors.map((e) => ({
      type: e.type,
      message: e.message,
      url: e.url,
      method: e.method,
      status: e.status,
      stackPreview: e.stack ? e.stack.split("\n").slice(0, 3).join("\n") : undefined,
      breadcrumbs: e.breadcrumbs?.slice(-4),
      timestamp: e.timestamp,
    })),
  };
}

function searchGlossary(args) {
  const query = (args?.query || "").toLowerCase().trim();
  if (!query) return { error: "Query cannot be empty" };

  const db = readJsonSafe(JSON_DB_FILE, { terminology: [] });
  const terms = (db.terminology || []).filter(
    (t) =>
      (t.sourceTerm && t.sourceTerm.toLowerCase().includes(query)) ||
      (t.targetTerm && t.targetTerm.toLowerCase().includes(query))
  );

  return {
    matchCount: terms.length,
    results: terms.slice(0, 15).map((t) => ({
      id: t.id,
      source: t.sourceTerm,
      target: t.targetTerm,
      category: t.category,
      brand: t.brand,
      confidence: t.confidence,
    })),
  };
}

function validateSopCompliance(args) {
  const text = args?.text || "";
  const violations = [];

  // Rule 1: No-sew formatting
  if (/\b(?:nosew|Nosew)\b/i.test(text)) {
    violations.push({
      rule: "No-sew Terminology Rule",
      message: "Must write 'No-sew' or 'no-sew' with a hyphen. NEVER 'Nosew' or 'nosew'.",
    });
  }

  // Rule 2: Tip-quarter formatting
  if (/\btip\s*quarter\b/i.test(text) && !/\btip-quarter\b/i.test(text)) {
    violations.push({
      rule: "Tip-quarter Terminology Rule",
      message: "Must write 'Tip-quarter' or 'tip-quarter' with a hyphen. NEVER 'Tip quarter' or 'Tipquarter'.",
    });
  }

  // Rule 3: SPI formatting
  const bareSpiMatch = text.match(/\b(\d+)\s*SPI\b/i);
  if (bareSpiMatch) {
    violations.push({
      rule: "SPI Stitches Formatting Rule",
      message: `Invalid SPI format '${bareSpiMatch[0]}'. Must use 'SPI <number> stitches/inch'.`,
    });
  }

  // Rule 4: Vietnamese diacritics leakage check
  const vnRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (vnRegex.test(text)) {
    violations.push({
      rule: "Zero Vietnamese Leakage Rule",
      message: "Detected Vietnamese diacritics in English output string.",
    });
  }

  return {
    isCompliant: violations.length === 0,
    violationCount: violations.length,
    violations,
    analyzedText: text,
  };
}

function getAuditHistory(args) {
  const limit = args?.limit || 10;
  const db = readJsonSafe(JSON_DB_FILE, { auditLogs: [] });
  const logs = (db.auditLogs || []).slice(0, limit);

  return {
    totalLogs: (db.auditLogs || []).length,
    recentLogs: logs.map((l) => ({
      id: l.id,
      operation: l.operation,
      status: l.status,
      userId: l.userId,
      durationMs: l.durationMs,
      timestamp: l.timestamp,
    })),
  };
}

// MCP Tool definitions
const TOOLS = [
  {
    name: "get_web_status",
    description: "Get real-time status of Secure Translator web app (http://localhost:3000), active AI provider, Gemini quota and error count.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_live_debug_errors",
    description: "Get latest live UI errors, failed API calls, and recent user clicks/breadcrumbs from the web app.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of error events to return (default 5)" },
      },
    },
  },
  {
    name: "search_glossary",
    description: "Search footwear terminology and Ching Luh standard glossary entries by keyword (Vietnamese or English).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword (e.g. 'toe', 'buffing', 'cementing', 'sole')" },
      },
      required: ["query"],
    },
  },
  {
    name: "validate_sop_compliance",
    description: "Audit text for Ching Luh SOP compliance rules (No-sew, Tip-quarter, SPI format, zero Vietnamese leakage).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to validate for SOP compliance" },
      },
      required: ["text"],
    },
  },
  {
    name: "get_audit_history",
    description: "Fetch recent translation audit logs and security events.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of logs (default 10)" },
      },
    },
  },
];

// JSON-RPC Dispatcher
async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "secure-translator-mcp",
          version: "1.0.0",
        },
      },
    };
  }

  if (method === "notifications/initialized") {
    return null; // No response for notifications
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    let resultData;

    switch (name) {
      case "get_web_status":
        resultData = await getWebStatus();
        break;
      case "get_live_debug_errors":
        resultData = getLiveDebugErrors(args);
        break;
      case "search_glossary":
        resultData = searchGlossary(args);
        break;
      case "validate_sop_compliance":
        resultData = validateSopCompliance(args);
        break;
      case "get_audit_history":
        resultData = getAuditHistory(args);
        break;
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`,
          },
        };
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}

// Start stdio interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);
    const response = await handleMessage(msg);
    if (response) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: " + err.message },
      }) + "\n"
    );
  }
});
