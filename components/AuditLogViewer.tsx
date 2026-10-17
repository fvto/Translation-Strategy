"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  operation: string;
  documentId?: string;
  status: "SUCCESS" | "FAILURE" | "WARNING";
  durationMs: number;
  errorCode?: string;
  details?: Record<string, any>;
}

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/audit-logs");
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      {/* Strict Confidentiality Banner (Section 25) */}
      <div className="p-4 rounded-3xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start space-x-3 text-xs shadow-2xs">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-blue-950">
            Section 25 Compliance: Strict Zero-Leak Audit Logging Policy
          </span>
          <p className="text-blue-800/80 leading-relaxed">
            In compliance with Section 25 and Rule 4, the audit logger records strictly operational telemetry (timestamps, user IDs, operation types, durations, and compliance scores). Source text, translated sentences, prompts, and document bodies are strictly scrubbed and never persisted to the audit log.
          </p>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Operational Audit Trail
            </h3>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-500 font-mono">
              {logs.length} entries recorded
            </span>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No audit records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200 font-sans">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-4 py-3">User / Actor</th>
                  <th className="px-4 py-3">Operation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-6 py-3">Sanitized Telemetry Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-sans">
                      {log.userEmail}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 font-sans">
                      {log.operation}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === "SUCCESS" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold font-sans">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          SUCCESS
                        </span>
                      ) : log.status === "FAILURE" ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-semibold font-sans">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          FAILURE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold font-sans">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          WARNING
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {log.durationMs} ms
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-[10px] truncate max-w-xs">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
