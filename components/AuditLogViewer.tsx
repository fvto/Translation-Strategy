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
      <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-800/40 text-blue-200 flex items-start space-x-3 text-xs shadow-lg">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-white">
            Section 25 Compliance: Strict Zero-Leak Audit Logging Policy
          </span>
          <p className="text-blue-200/80">
            In compliance with Section 25 and Rule 4, the audit logger records strictly operational telemetry (timestamps, user IDs, operation types, durations, and compliance scores). Source text, translated sentences, prompts, and document bodies are strictly scrubbed and never persisted to the audit log.
          </p>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">
              Operational Audit Trail
            </h3>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400 font-mono">
              {logs.length} entries recorded
            </span>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
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
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800 font-sans">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-4 py-3">User / Actor</th>
                  <th className="px-4 py-3">Operation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-6 py-3">Sanitized Telemetry Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {log.userEmail}
                    </td>
                    <td className="px-4 py-3 font-semibold text-blue-400">
                      {log.operation}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === "SUCCESS" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          SUCCESS
                        </span>
                      ) : log.status === "FAILURE" ? (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          FAILURE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          WARNING
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {log.durationMs} ms
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-[10px] truncate max-w-xs">
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
