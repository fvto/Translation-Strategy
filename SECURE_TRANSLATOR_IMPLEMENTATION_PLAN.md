# Secure Translation Application — Implementation Plan

## 1. Objective

Build a secure internal translation application for translating confidential business and strategic documents.

The application must:

1. Translate text between selected languages.
2. Allow users to upload terminology/reference files:
   - `.xlsx`
   - `.docx`
   - `.pptx`
   - `.pdf`
3. Extract terminology and contextual definitions from uploaded files.
4. Use extracted terminology as a controlled Translation Memory / Glossary.
5. Prioritize approved terminology over generic machine translation.
6. Preserve formatting and structure where possible.
7. Prevent confidential source text from being unnecessarily persisted.
8. Clearly separate source text, terminology, translation, and user corrections.
9. Provide a review interface so users can verify terminology before translation.
10. Never expose uploaded confidential files through public URLs.

---

# 2. Security-First Architecture

The application must be designed as **local-first and security-first**.

Preferred flow:

```text
User
  ↓
Web Application
  ↓
Authenticated Backend
  ↓
Document Processor
  ↓
Terminology / Glossary Engine
  ↓
Translation Engine
  ↓
Terminology + Quality Validation
  ↓
Human Review
  ↓
Final Translation
```

Avoid unnecessarily sending confidential files to third-party services.

Any third-party AI/translation/OCR service must be an explicit configurable provider, not an implicit dependency.

---

# 3. Recommended Technology Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

## Backend

Preferred for MVP:

- Next.js API routes / Server Actions

For heavier document processing:

- Python FastAPI processing service

Python is preferred for document parsing and NLP because of its ecosystem for:

- XLSX
- DOCX
- PPTX
- PDF
- OCR
- NLP

## Database

Use a relational database such as PostgreSQL.

The database must store structured terminology and metadata, not raw confidential document content unless explicitly required.

## File Storage

Use private storage or a protected local filesystem.

Never place confidential files inside:

```text
/public
/static
/public/uploads
```

---

# 4. Core Modules

Create these modules:

```text
Authentication
Authorization
Document Upload
Document Processing
Terminology Extraction
Glossary Management
Terminology Matching
Translation
Translation Provider
Terminology Validation
Quality Assurance
Secure File Management
Audit Logging
Settings
```

---

# 5. Document Processing Layer

Create a common abstraction:

```typescript
interface DocumentProcessor {
  process(file: UploadedFile): Promise<ExtractedDocument>;
}
```

Normalized output:

```typescript
interface ExtractedDocument {
  fileName: string;
  fileType: "xlsx" | "docx" | "pptx" | "pdf";
  text: string;
  sections: DocumentSection[];
  tables?: DocumentTable[];
  metadata?: DocumentMetadata;
}
```

Implement separate processors:

```text
XlsxProcessor
DocxProcessor
PptxProcessor
PdfProcessor
```

---

# 6. XLSX Processing

Use `openpyxl`.

Extract:

- workbook name
- sheet names
- headers
- cell values
- tables
- terminology pairs
- definitions
- notes/comments when useful

Example:

```text
Sheet: IT Terminology

English                Vietnamese
Access Control         Kiểm soát truy cập
Risk Assessment        Đánh giá rủi ro
Business Continuity    Tính liên tục kinh doanh
```

Normalize into:

```json
{
  "sourceTerm": "Access Control",
  "targetTerm": "Kiểm soát truy cập",
  "sourceLanguage": "en",
  "targetLanguage": "vi",
  "confidence": 1.0,
  "source": "IT Terminology.xlsx"
}
```

Do not automatically mark extracted terminology as approved.

---

# 7. DOCX Processing

Use `python-docx`.

Extract:

- headings
- paragraphs
- tables
- bullet lists
- numbered lists

Preserve document hierarchy.

Example:

```text
Heading 1
 ├── Paragraph
 ├── Paragraph
 └── Table
```

---

# 8. PPTX Processing

Use `python-pptx`.

Extract:

- slide number
- slide title
- text boxes
- tables
- speaker notes if explicitly enabled

Example:

```json
{
  "slide": 4,
  "title": "Risk Management",
  "content": [
    "Risk identification",
    "Risk assessment",
    "Risk mitigation"
  ]
}
```

---

# 9. PDF Processing

The PDF processor must first determine whether the PDF is:

1. Text-based
2. Scanned/image-based

Pipeline:

```text
PDF
 ↓
Detect text layer
 ↓
Text extraction
 ↓
OCR only if required
 ↓
Normalize extracted content
 ↓
Terminology extraction
```

Do not automatically send confidential PDFs to external OCR providers.

OCR must be configurable.

---

# 10. Terminology Engine

Create:

```text
TerminologyEngine
```

Responsibilities:

```text
extractTerms()
normalizeTerms()
searchTerms()
matchTerms()
validateTranslation()
```

Terminology is a first-class feature, not just extra prompt text.

---

# 11. Terminology Data Model

Create:

```typescript
interface TerminologyEntry {
  id: string;

  sourceTerm: string;
  targetTerm: string;

  sourceLanguage: string;
  targetLanguage: string;

  definition?: string;
  context?: string;
  category?: string;

  sourceDocument?: string;

  status:
    | "approved"
    | "review"
    | "deprecated";

  priority: number;

  createdAt: string;
  updatedAt: string;
}
```

Recommended additional fields:

```text
caseSensitive
notes
examples
createdBy
approvedBy
version
```

---

# 12. Terminology Priority

Translation must follow this priority:

```text
1. Approved internal terminology
2. User-defined terminology
3. Approved document-specific terminology
4. Reviewed terminology
5. Generic translation
```

Example:

Generic translation:

```text
Risk appetite → khẩu vị rủi ro
```

Internal glossary:

```text
Risk Appetite → Mức độ chấp nhận rủi ro
```

The application must prefer:

```text
Mức độ chấp nhận rủi ro
```

---

# 13. Terminology Matching

Support:

- exact matching
- case-insensitive matching
- phrase matching
- plural/basic morphology where safe
- contextual matching
- longest/most-specific phrase matching

Example:

Glossary:

```text
Access Control
```

Should detect:

```text
Access Control
access control
ACCESS CONTROL
Access Controls
```

But do not incorrectly match unrelated phrases.

Example:

```text
controlled access
```

must not automatically be treated as:

```text
Access Control
```

unless confidence is high.

---

# 14. Glossary Review Workflow

After document processing:

```text
87 terms detected
```

Display:

| Source Term | Target Term | Status |
|---|---|---|
| Risk Assessment | Đánh giá rủi ro | Review |
| Access Control | Kiểm soát truy cập | Approved |
| Business Continuity | Tính liên tục kinh doanh | Review |

Actions:

```text
Approve
Edit
Reject
Delete
```

Never silently promote automatically extracted terms to approved terminology.

---

# 15. Translation Pipeline

Implement:

```text
Input Text
 ↓
Language Detection
 ↓
Terminology Matching
 ↓
Context Extraction
 ↓
Translation Request Construction
 ↓
Translation Provider
 ↓
Terminology Validation
 ↓
Quality Checks
 ↓
Final Translation
```

---

# 16. Translation Provider Abstraction

Never hard-code the application to a single AI provider.

Create:

```typescript
interface TranslationProvider {
  translate(
    request: TranslationRequest
  ): Promise<TranslationResponse>;
}
```

Implement providers such as:

```text
CloudTranslationProvider
LocalLLMProvider
```

The provider must be configurable.

The frontend must never directly contain provider API keys.

---

# 17. Translation Context

Do not send a simple request such as:

```text
Translate this text.
```

Construct structured context.

Example:

```text
SYSTEM

You are a professional business translator.

Rules:
1. Preserve original meaning.
2. Do not add information.
3. Do not remove information.
4. Preserve numbers.
5. Preserve dates.
6. Preserve names.
7. Preserve acronyms.
8. Preserve company and product names.
9. Use approved terminology whenever applicable.

APPROVED TERMINOLOGY

Access Control = Kiểm soát truy cập
Risk Assessment = Đánh giá rủi ro
Business Continuity = Tính liên tục kinh doanh

SOURCE

[confidential source text]
```

Do not include unrelated confidential documents as context.

Only send the minimum relevant terminology/context required.

---

# 18. Terminology Validation

After translation, run a separate validation stage.

Example:

Source:

```text
Risk Assessment must be completed annually.
```

Expected terminology:

```text
Đánh giá rủi ro
```

If translation contains:

```text
đánh giá nguy cơ
```

flag:

```text
⚠ Terminology mismatch

Expected:
Đánh giá rủi ro

Detected:
đánh giá nguy cơ
```

Do not silently modify the translation.

The user must be able to review the issue.

---

# 19. Quality Assurance Checks

Validate at minimum:

```text
Numbers
Percentages
Dates
Currency
URLs
Email addresses
Acronyms
Company names
Product names
Codes
Document references
Approved terminology
```

Example acronyms that should not be casually translated:

```text
ISO 27001
NIST CSF
QMS
COPQ
CAPA
RCA
```

---

# 20. Main UI

Create a professional internal-tool interface.

```text
┌─────────────────────────────────────────────────────┐
│ Secure Translation Workspace                        │
├─────────────────────────────────────────────────────┤
│ Source Language       Target Language               │
│ [ English ▼ ]         [ Vietnamese ▼ ]              │
├───────────────────────┬─────────────────────────────┤
│ SOURCE                │ TRANSLATION                 │
│                       │                             │
│ Paste text...         │ Translation appears here   │
│                       │                             │
├───────────────────────┴─────────────────────────────┤
│ Detected / Applied Terminology                       │
│                                                     │
│ Risk Assessment → Đánh giá rủi ro       ✓ Approved │
│ Access Control → Kiểm soát truy cập     ✓ Approved │
├─────────────────────────────────────────────────────┤
│ [ Translate ]       [ Clear ]       [ Export ]      │
└─────────────────────────────────────────────────────┘
```

---

# 21. Reference Documents Panel

Create:

```text
Reference Documents
```

Example:

```text
✓ IT_Glossary.xlsx
✓ Strategy_Terminology.docx
✓ Corporate_Terms.pdf

[ + Add document ]
```

Display:

```text
Filename
File type
Number of extracted terms
Processing status
Created date
Delete
```

Never expose public download URLs.

---

# 22. Confidentiality Controls

Each uploaded document must have:

```text
document_id
owner_id
classification
created_at
retention_policy
```

Do not expose:

```text
/uploads/confidential-file.pdf
```

through an unrestricted route.

Use authorization checks before every file operation.

---

# 23. Temporary Processing

Preferred high-security workflow:

```text
Upload
 ↓
Process
 ↓
Extract terminology
 ↓
Translate
 ↓
Delete temporary source
```

Provide retention settings:

```text
Document retention

○ Delete after processing
○ Keep until manually deleted
```

Default:

```text
Delete after processing
```

---

# 24. Translation History

Do not automatically store complete source/translation history.

Provide an explicit:

```text
Save translation
```

action.

If history is enabled, store metadata such as:

```text
translation_id
timestamp
language_pair
document_id
user_id
glossary_version
```

Avoid storing full confidential source/translation text unless explicitly required.

---

# 25. Logging Policy

Never log:

```text
source_text
translated_text
document_content
confidential prompts
confidential glossary content
full provider responses containing confidential content
```

Log only operational metadata:

```text
timestamp
user_id
operation
document_id
status
error_code
duration
```

Example:

```text
2026-09-15 16:30
USER_001
TRANSLATION_COMPLETED
DOC_382
SUCCESS
```

---

# 26. API Key Security

Never do this:

```javascript
const API_KEY = "sk-xxxxx";
```

Correct architecture:

```text
Browser
 ↓
Backend
 ↓
Translation Provider
```

API keys must exist only in:

```text
.env
```

or a proper secret manager.

Never commit `.env` to source control.

Provide:

```text
.env.example
```

with placeholders only.

---

# 27. Local LLM Architecture

The system must support a future local/on-premise translation provider.

Architecture:

```text
Application
     ↓
Local LLM Server
     ↓
Model
```

This provides a future path where confidential source text can remain inside the organization's environment.

Do not make the application dependent on a local model for MVP, but keep the provider interface compatible with it.

---

# 28. Data Classification

Support optional classification:

```text
Internal
Confidential
Highly Confidential
```

For `Highly Confidential`, allow policies such as:

```text
No cloud translation
No persistent source storage
No translation history
No external OCR
Local-only processing
```

These policies should be configurable by an administrator.

---

# 29. Authentication

MVP:

```text
Email + password
```

Production/internal enterprise option:

```text
Microsoft Entra ID / SSO
```

Implement RBAC.

Roles:

```text
Admin
Translator
Reviewer
Viewer
```

---

# 30. RBAC

## Admin

Can:

```text
Manage users
Manage glossary
Manage settings
Manage providers
Manage security policies
```

## Translator

Can:

```text
Upload reference documents
Translate
Use glossary
Create terminology entries
```

## Reviewer

Can:

```text
Review translations
Approve terminology
Reject terminology
```

## Viewer

Can:

```text
View permitted content
```

---

# 31. Glossary Versioning

Support glossary versions:

```text
Corporate Glossary v1.0
Corporate Glossary v1.1
Corporate Glossary v2.0
```

Each saved translation should record the glossary version used.

Example:

```text
Translation #382

Language:
EN → VI

Glossary:
Corporate_Glossary v2.1
```

This makes translations reproducible and auditable.

---

# 32. Translation QA Score

Provide a rule-based QA indicator, not a claim of translation accuracy.

Example:

```text
Terminology compliance: 98%

✓ 18/18 approved terms detected
✓ Numbers preserved
✓ Acronyms preserved
⚠ 1 terminology mismatch
```

Do not label this:

```text
98% translation accuracy
```

It is only a quality-control indicator.

---

# 33. Document Translation

## MVP

Support:

```text
Extract → Translate → Export
```

Prioritize plain-text translation first.

## Phase 2

Support format-aware translation:

```text
DOCX
PPTX
XLSX
PDF
```

Preserve:

```text
headings
tables
slide structure
basic formatting
```

Do not overcomplicate MVP with perfect layout reconstruction.

---

# 34. Suggested Project Structure

```text
secure-translator/
│
├── app/
│   ├── login/
│   ├── translate/
│   ├── glossary/
│   ├── documents/
│   ├── settings/
│   └── api/
│
├── components/
│   ├── TranslationEditor/
│   ├── GlossaryPanel/
│   ├── DocumentUploader/
│   ├── TerminologyTable/
│   └── SecurityStatus/
│
├── services/
│   ├── translation/
│   │   ├── provider.ts
│   │   ├── cloud.ts
│   │   └── local.ts
│   │
│   ├── documents/
│   │   ├── xlsx.ts
│   │   ├── docx.ts
│   │   ├── pptx.ts
│   │   └── pdf.ts
│   │
│   ├── terminology/
│   │   ├── extractor.ts
│   │   ├── normalizer.ts
│   │   ├── matcher.ts
│   │   └── validator.ts
│   │
│   └── security/
│       ├── encryption.ts
│       ├── access-control.ts
│       └── audit.ts
│
├── database/
│   ├── schema/
│   └── migrations/
│
├── lib/
│
├── tests/
│   ├── terminology/
│   ├── translation/
│   ├── documents/
│   └── security/
│
└── .env.example
```

---

# 35. MVP Scope

## Must Have

```text
✓ Authentication
✓ Text translation
✓ XLSX upload
✓ DOCX upload
✓ PPTX upload
✓ PDF upload
✓ Text extraction
✓ Terminology extraction
✓ Glossary review
✓ Glossary approval
✓ Terminology matching
✓ Translation
✓ Terminology validation
✓ Secure file handling
✓ Explicit document deletion
✓ Basic QA checks
```

## Later

```text
○ Full document translation
○ OCR
○ SSO
○ Advanced RBAC
○ Glossary versioning
○ Local LLM
○ Translation Memory
○ CAT-style editor
○ Advanced QA
○ Enterprise audit dashboard
```

---

# 36. AI Agent Implementation Rules

These rules are mandatory.

```text
1. Treat all uploaded documents and translated text as confidential.

2. Never expose uploaded files through public URLs.

3. Never place confidential files inside /public or static directories.

4. Never log source text, translated text, document contents, prompts, glossary contents, or API responses containing confidential information.

5. Never expose API keys to the browser.

6. Never hard-code API keys.

7. Implement a TranslationProvider abstraction so the translation provider can be replaced.

8. Implement a LocalLLM provider interface even if it is not enabled in MVP.

9. Uploaded reference documents must be processed through a dedicated DocumentProcessor abstraction.

10. Support XLSX, DOCX, PPTX and PDF.

11. Extract terminology into a normalized terminology database.

12. Do not automatically mark extracted terminology as approved.

13. Require terminology review before marking terminology as approved.

14. Approved terminology must have higher priority than generic translation.

15. After translation, run terminology validation.

16. Flag terminology mismatches instead of silently replacing them.

17. Preserve numbers, dates, acronyms, company names, product names, codes and URLs.

18. Do not modify source text.

19. Do not invent terminology that is not supported by the glossary unless no approved terminology exists.

20. Do not silently overwrite user-approved terminology.

21. Provide explicit delete controls for documents and extracted terminology.

22. Use temporary storage for document processing whenever possible.

23. Default confidential documents to automatic deletion after processing.

24. Do not store translation history unless the user explicitly chooses to save it.

25. Use secure authentication and authorization.

26. Validate file extensions AND MIME/content signatures.

27. Enforce maximum upload size.

28. Prevent path traversal and arbitrary file access.

29. Sanitize filenames.

30. Handle malformed and malicious documents safely.

31. Never execute uploaded files.

32. Implement rate limiting on translation endpoints.

33. Implement CSRF protection where applicable.

34. Use secure HTTP headers.

35. Write unit tests for terminology matching and validation.

36. Write security tests for file upload and access control.

37. Do not sacrifice security for convenience.

38. Before implementing a feature, check whether it causes confidential information to leave the application.

39. If a feature requires sending confidential information to a third-party service, make the data flow explicit in the UI and configuration.

40. Never claim that the application is "100% secure" or "completely confidential".
```

---

# 37. Development Phases

## Phase 1 — Foundation

```text
Next.js
TypeScript
UI
Authentication
Database
Security middleware
```

## Phase 2 — Document Ingestion

```text
XLSX
DOCX
PPTX
PDF
```

## Phase 3 — Glossary

```text
Extraction
Normalization
Review
Approval
Search
Matching
```

## Phase 4 — Translation

```text
Translation provider
Prompt/context construction
Translation
```

## Phase 5 — QA

```text
Terminology validation
Number validation
Acronym validation
Potential issue detection
```

## Phase 6 — Security Hardening

```text
Access control
Encryption
Secure deletion
Rate limiting
Audit logs
File validation
Security testing
```

## Phase 7 — Advanced Features

```text
Document translation
OCR
Translation Memory
Local LLM
SSO
Glossary versioning
```

---

# 38. Acceptance Criteria

The implementation is considered complete for MVP only when:

### Document Processing

- [ ] XLSX can be uploaded and parsed.
- [ ] DOCX can be uploaded and parsed.
- [ ] PPTX can be uploaded and parsed.
- [ ] PDF can be uploaded and parsed.
- [ ] Invalid/malicious files are rejected safely.
- [ ] Maximum upload size is enforced.
- [ ] Files are not publicly accessible.

### Terminology

- [ ] Terms can be extracted.
- [ ] Terms can be reviewed.
- [ ] Terms can be approved/rejected.
- [ ] Approved terms override generic translation.
- [ ] Exact and case-insensitive matching works.
- [ ] Incorrect partial matching is minimized.
- [ ] Terminology mismatches are flagged.

### Translation

- [ ] Translation provider is abstracted.
- [ ] API keys are server-side only.
- [ ] Relevant glossary terms are supplied to the provider.
- [ ] Numbers/dates/acronyms are checked.
- [ ] Translation output is reviewable before export.

### Security

- [ ] No confidential content appears in application logs.
- [ ] No API keys appear in frontend code.
- [ ] No confidential documents exist under public static paths.
- [ ] Access control is checked for every document operation.
- [ ] Temporary files can be deleted automatically.
- [ ] User can explicitly delete documents.
- [ ] Third-party data transmission is clearly configurable and documented.

### Testing

- [ ] Unit tests for terminology matching.
- [ ] Unit tests for terminology validation.
- [ ] File upload security tests.
- [ ] Authorization tests.
- [ ] Path traversal tests.
- [ ] Malformed document tests.
- [ ] API authentication tests.

---

# 39. Critical Architectural Principle

Do not build this as merely:

```text
Google Translate clone
+
Upload glossary
```

Build it as a lightweight **secure CAT/terminology management system**:

```text
              CONFIDENTIAL SOURCE
                       │
                       ▼
              ┌─────────────────┐
              │ Document Parser │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Terminology DB  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Translation     │
              │ Engine          │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Terminology QA  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Human Review    │
              └────────┬────────┘
                       │
                       ▼
                 FINAL VERSION
```

The key principle is:

**AI must not freely invent or replace controlled internal terminology when an approved terminology entry exists.**

The glossary should be treated as a **controlled vocabulary**.

---

# 40. Final Agent Instruction

Before writing implementation code:

1. Inspect the existing repository.
2. Identify the current framework and package manager.
3. Do not replace existing architecture unnecessarily.
4. Produce a concise implementation checklist.
5. Implement the MVP in small, testable modules.
6. Run tests after each major module.
7. Fix security issues before adding convenience features.
8. Never use mock security controls as if they were production security controls.
9. Clearly identify any component that sends confidential content outside the local application.
10. At the end, provide:
   - files created/changed
   - dependencies added
   - environment variables required
   - database migrations
   - security assumptions
   - known limitations
   - tests executed
   - instructions to run locally
