import fs from "fs";
import path from "path";
import { SmartAuditReport } from "./smart-detector";

const TRACE_DIR = path.resolve(process.cwd(), "data", "audit_traces");
const HISTORY_DIR = path.join(TRACE_DIR, "history");

export interface AuditTraceMeta {
  mode?: string;
  sourceLang?: string;
  targetLang?: string;
  sessionId?: string;
  action?: string;
  clientIp?: string;
}

/**
 * Persists telemetry and format analysis data for uploaded PPTX documents
 * to disk (both latest_trace.json and historical timestamped snapshot).
 */
export function saveAuditTrace(
  fileName: string,
  report: SmartAuditReport,
  meta: AuditTraceMeta = {}
): string {
  try {
    if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true });
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const tracePath = path.join(TRACE_DIR, "latest_trace.json");
    const historyPath = path.join(HISTORY_DIR, `${timestamp}_${safeName}.json`);

    const slidesSummary: Record<number, { title?: string; totalUnits: number; needsTranslation: number; alreadyTranslated: number; units: any[] }> = {};

    for (const u of report.units || []) {
      const sIdx = u.location.slideIndex ?? 0;
      if (!slidesSummary[sIdx]) {
        slidesSummary[sIdx] = { totalUnits: 0, needsTranslation: 0, alreadyTranslated: 0, units: [] };
      }
      slidesSummary[sIdx].totalUnits++;
      if (u.requiresTranslation) slidesSummary[sIdx].needsTranslation++;
      if (u.status === "ALREADY_TRANSLATED") slidesSummary[sIdx].alreadyTranslated++;
      if (u.location.isTitle && !slidesSummary[sIdx].title) {
        slidesSummary[sIdx].title = u.sourceText;
      }
      slidesSummary[sIdx].units.push({
        id: u.id,
        shapeIndex: u.location.shapeIndex,
        paragraphIndex: u.location.paragraphIndex,
        containerId: u.location.containerId,
        text: u.sourceText,
        status: u.status,
        requiresTranslation: u.requiresTranslation,
        existingTranslation: u.existingTranslation || null,
        suggestedTranslation: u.suggestedTranslation || null,
        reason: u.reason || null,
      });
    }

    const traceData = {
      fileName,
      recordedAt: new Date().toISOString(),
      meta,
      summary: {
        totalUnits: report.units?.length || 0,
        needsTranslation: report.units?.filter((u) => u.requiresTranslation).length || 0,
        alreadyTranslated: report.units?.filter((u) => u.status === "ALREADY_TRANSLATED").length || 0,
        nonTranslatable: report.units?.filter((u) => u.status === "NON_TRANSLATABLE").length || 0,
        requiresIsqDuplicate: report.requiresIsqDuplicate,
      },
      slidesSummary,
      report,
    };

    fs.writeFileSync(tracePath, JSON.stringify(traceData, null, 2), "utf-8");
    fs.writeFileSync(historyPath, JSON.stringify(traceData, null, 2), "utf-8");
    console.log(`[AuditTrace] Saved telemetry trace to ${tracePath} and ${historyPath}`);
    return tracePath;
  } catch (err) {
    console.warn("[AuditTrace] Failed to save audit trace:", err);
    return "";
  }
}
