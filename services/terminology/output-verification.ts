import JSZip from "jszip";
import { paragraphText, PPTX_PARAGRAPH_PATTERN } from "../documents/pptx-text";
import type { TerminologyObservation, TerminologyConflict, DocumentTerminologyReport } from "./document-plan";
import type { PostFlightIssue, PostFlightAuditReport } from "../qa/pptx-postflight-gate";

export interface PackagedTerminologyUnit extends TerminologyObservation { partPath: string }
const normalized = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Verify the packaged text, after postflight repairs, rather than trusting a model's response. */
export async function verifyPackagedTerminology(buffer: Buffer, units: PackagedTerminologyUnit[], repairs: PostFlightIssue[]) {
  const zip = await JSZip.loadAsync(buffer);
  const parts = new Map<string, string[]>();
  const observations: TerminologyObservation[] = [], unverified: TerminologyConflict[] = [];
  for (const unit of units) {
    if (!parts.has(unit.partPath)) {
      const xml = await zip.file(unit.partPath)?.async("string") || "";
      parts.set(unit.partPath, (xml.match(new RegExp(PPTX_PARAGRAPH_PATTERN)) || []).map(paragraphText));
    }
    let expected = unit.targetText;
    for (const repair of repairs) {
      if (repair.autoRepaired && repair.originalText && repair.targetText && normalized(repair.originalText) === normalized(expected)) expected = repair.targetText;
    }
    const actual = parts.get(unit.partPath)!.find(text => normalized(text) === normalized(expected));
    if (actual !== undefined) observations.push({ ...unit, targetText: actual });
    else unverified.push({ conceptId: `output:${unit.id}`, sourceTerm: unit.sourceText, preferredTarget: expected, kind: "unverified_output", candidates: [],
      occurrences: [{ unitId: unit.id, slideIndex: unit.slideIndex, protected: Boolean(unit.protected), targetText: expected }] });
  }
  return { observations, unverified };
}

export function attachTerminologyGate(postFlight: PostFlightAuditReport, report: DocumentTerminologyReport, unverified: TerminologyConflict[] = []) {
  report.groups.push(...unverified);
  report.passed = report.groups.length === 0;
  postFlight.terminologyConsistency = report;
  if (!report.passed) {
    postFlight.passed = false;
    for (const group of report.groups) postFlight.issues.push({
      slide: [...new Set(group.occurrences.map(occurrence => String(occurrence.slideIndex || "?")))].join(","),
      type: "terminology", message: `${group.kind}: ${group.sourceTerm} => ${group.preferredTarget || group.candidates.join(" / ")}`,
      originalText: group.occurrences[0]?.targetText, targetText: group.preferredTarget, autoRepaired: false,
    });
  }
}
