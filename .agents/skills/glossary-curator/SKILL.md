---
name: glossary-curator
description: Proactive glossary sentinel agent that continuously validates, sanitizes, and quarantines corrupted dictionary entries, merged-cell table collisions, and identical source/target terms.
---

# Glossary Curator & Sentinel Agent

## Purpose
Solves **Inefficiency #2 (Silent Glossary Poisoning from Bulk Imports)** by acting as a proactive gatekeeper at database entry points and providing periodic hygiene audits.

## Execution Workflow
1. **Real-time Pre-Commit Validation**:
   - Intercepts all `addTerminology()` and `updateTerm()` calls.
   - Rejects identical terms: `sourceTerm.toLowerCase() === targetTerm.toLowerCase()`.
   - Rejects cross-language diacritical pollution (e.g. Vietnamese marks in an English target).
   - Rejects merged-cell instruction collapse (e.g. 20-word instruction mapped to `*Hot/cool shaping`).
   - Auto-corrects inverted noun phrases: `Shape tip` -> `Tip shape`.
2. **Periodic Health Auditing**:
   - Scans entire `data/database.json`.
   - Flags orphaned entries, reverse-mapping conflicts, and outdated terms.
   - Generates a health report with total active terms and anomalies.

## Integration Point
- Functions: `sanitizeTerminologyEntry()` and `auditTerminologyHealth()` in `services/terminology/sanitizer.ts`.
- Integrated directly into `DatabaseService` in `services/database/db.ts`.
