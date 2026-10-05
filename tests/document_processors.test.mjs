import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { documentProcessingService } from "../services/documents/index.ts";

test("Document Processor - XLSX Terminology Table Ingestion", async () => {
  // Create synthetic XLSX workbook in memory with bilingual terminology table
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["English Term", "Vietnamese Translation", "Context"],
    ["Zero Trust Architecture", "Kiểm trúc Zero Trust", "Cybersecurity"],
    ["Incident Response", "Ứng phó sự cố", "Security Operations"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "SecurityGlossary");
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const extracted = await documentProcessingService.processDocument(xlsxBuffer, "security_terms.xlsx");
  assert.equal(extracted.fileType, "xlsx");
  assert.equal(extracted.termCandidates.length, 2);
  assert.equal(extracted.termCandidates[0].sourceTerm, "Zero Trust Architecture");
  assert.equal(extracted.termCandidates[0].targetTerm, "Kiểm trúc Zero Trust");
  assert.equal(extracted.termCandidates[1].sourceTerm, "Incident Response");
  assert.equal(extracted.termCandidates[1].targetTerm, "Ứng phó sự cố");
});

test("Document Processor - PPTX Slide Deck Ingestion", async () => {
  // Create synthetic PPTX zip archive in memory
  const zip = new JSZip();
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Enterprise Strategy 2026</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:t>Risk Appetite: Mức độ chấp nhận rủi ro</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.file("ppt/slides/slide1.xml", slide1Xml);
  const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const extracted = await documentProcessingService.processDocument(pptxBuffer, "strategy.pptx");
  assert.equal(extracted.fileType, "pptx");
  assert.ok(extracted.sections.length >= 1);
  assert.ok(extracted.fullText.includes("Enterprise Strategy 2026"));
  assert.ok(extracted.termCandidates.length >= 1);
  assert.equal(extracted.termCandidates[0].sourceTerm, "Risk Appetite");
});
