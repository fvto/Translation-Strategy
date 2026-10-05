export type UserRole = "admin" | "translator" | "reviewer" | "viewer";
export type TermStatus = "approved" | "review" | "rejected" | "deprecated";
export type DataClassification = "internal" | "confidential" | "highly_confidential";
export type RetentionPolicy = "delete_immediately" | "persist_until_manual";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  ownerId: string;
  fileName: string;
  fileType: "xlsx" | "docx" | "pptx" | "pdf";
  classification: DataClassification;
  retentionPolicy: RetentionPolicy;
  termCount: number;
  status: "processed" | "deleted";
  storagePath?: string;
  createdAt: string;
}

export interface TermEditChange {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface TermEditHistoryEntry {
  id: string;
  timestamp: string;
  editedBy: string;
  action: "created" | "updated" | "status_changed" | "auto_harvested";
  changes?: TermEditChange[];
  note?: string;
}

export interface TerminologyEntry {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLanguage: string;
  targetLanguage: string;
  definition?: string;
  context?: string;
  category?: string;
  sourceDocument?: string;
  status: TermStatus;
  priority: number;
  confidence?: number;
  createdBy?: string;
  approvedBy?: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
  editHistory?: TermEditHistoryEntry[];
}

export interface AuditLogEntry {
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

export interface SavedTranslation {
  id: string;
  userId: string;
  sourceLang: string;
  targetLang: string;
  glossaryVersion: string;
  qaScore: number;
  createdAt: string;
}

export interface AppSettings {
  defaultProvider: "airgapped" | "google_translate" | "huggingface" | "openai" | "gemini" | "local_llm" | "antigravity_cli" | "ctranslate2";
  retentionPolicy: RetentionPolicy;
  googleApiKey?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  huggingFaceApiKey?: string;
  huggingFaceModel?: string;
  localLlmUrl?: string;
  localLlmModel?: string;
}

export interface SopContextRule {
  id: string;
  name: string;
  category: "tolerance" | "grammar_adjunct" | "process_constraint" | "prohibited_translation" | "polysemy" | "general_sop";
  triggerPatterns: string[];
  promptInstruction: string;
  prohibitedOutputs?: string[];
  autoRepairReplacement?: string;
  examples?: { source: string; target: string; rationale?: string }[];
  enabled: boolean;
  priority?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  users: User[];
  documents: DocumentRecord[];
  terminology: TerminologyEntry[];
  auditLogs: AuditLogEntry[];
  savedTranslations: SavedTranslation[];
  settings: AppSettings;
  sopRules?: SopContextRule[];
}

