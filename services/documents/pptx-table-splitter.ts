import type JSZip from "jszip";
import { orderedSlidePaths } from "./pptx-slide-order";

export interface SplitSlideDetail {
  originalSlideIndex: number;
  newSlideIndex: number;
  title: string;
  rowsOnPart1: number;
  rowsOnPart2: number;
}

export interface SplitTableResult {
  splitCount: number;
  details: SplitSlideDetail[];
}

/**
 * Checks if a table XML in a slide is overflowing the slide's vertical display space.
 * Tables with >= 4 data rows and significant text content in bilingual mode exceed
 * the standard 7.5-inch slide height and should be split into Part 1 and Part 2.
 */
export function inspectTableOverflow(tblXml: string): {
  shouldSplit: boolean;
  totalRows: number;
  dataRowCount: number;
  splitIndex: number; // 0-based index of the first row that goes to Part 2
} {
  const rowMatches = Array.from(tblXml.matchAll(/<a:tr\b(?:[\s>][\s\S]*?<\/a:tr>|\/>)/g));
  const totalRows = rowMatches.length;

  if (totalRows < 5) {
    // 1 header + <= 3 data rows: comfortably fits without splitting
    return { shouldSplit: false, totalRows, dataRowCount: Math.max(0, totalRows - 1), splitIndex: totalRows };
  }

  // Count total substantive text inside the table
  const allTexts = Array.from(tblXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );
  const totalChars = allTexts.join(" ").length;

  // If table has >= 4 data rows and >= 800 characters (or >= 5 data rows):
  // It is mathematically impossible to display bilingually on 1 slide without overflowing!
  const dataRowCount = totalRows - 1;
  const isOverflowing = dataRowCount >= 5 || (dataRowCount >= 4 && totalChars >= 800);

  if (!isOverflowing) {
    return { shouldSplit: false, totalRows, dataRowCount, splitIndex: totalRows };
  }

  // Divide data rows evenly between Part 1 and Part 2
  // e.g. for 5 data rows (rows 1,2,3,4,5): Part 1 gets rows 1..3 (3 rows), Part 2 gets rows 4..5 (2 rows)
  // splitIndex = 1 + Math.ceil(5 / 2) = 4
  const part1DataCount = Math.ceil(dataRowCount / 2);
  const splitIndex = 1 + part1DataCount;

  return { shouldSplit: true, totalRows, dataRowCount, splitIndex };
}

/**
 * Scans a PowerPoint presentation package and automatically splits overflowing tables
 * into continued slides (Part 1/2 and Part 2/2).
 *
 * Preserves 100% of header columns, geometries, styling, shapes, and metadata.
 */
export async function splitOverflowingTableSlides(
  zip: JSZip,
  options?: {
    forceSlideIndices?: Set<number>;
    partSuffix?: "fraction" | "dash"; // " (Part 1/2)" vs " - Part 1"
  }
): Promise<SplitTableResult> {
  const orderedPaths = await orderedSlidePaths(zip);
  if (orderedPaths.length === 0) return { splitCount: 0, details: [] };

  let presXml = await zip.file("ppt/presentation.xml")?.async("string");
  let relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  let contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  if (!presXml || !relsXml || !contentTypesXml) return { splitCount: 0, details: [] };

  const sldEntries = Array.from(presXml.matchAll(/<p:sldId\b[^>]*>/g))
    .map((m) => {
      const fullTag = m[0];
      const idMatch = fullTag.match(/\bid="(\d+)"/);
      const rIdMatch = fullTag.match(/\br:id="([^"]+)"/);
      return {
        fullTag,
        id: idMatch ? parseInt(idMatch[1], 10) : 0,
        rId: rIdMatch ? rIdMatch[1] : "",
      };
    })
    .filter((s) => s.id > 0 && s.rId !== "");

  if (sldEntries.length === 0) return { splitCount: 0, details: [] };

  const allIds = sldEntries.map((s) => s.id);
  let maxId = Math.max(255, ...allIds);

  const rids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map((m) => parseInt(m[1], 10));
  let maxRId = Math.max(10, ...rids);

  const relTargetMap = new Map<string, string>();
  for (const rm of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relTargetMap.set(rm[1], rm[2]);
  }

  const details: SplitSlideDetail[] = [];
  const newRels: string[] = [];
  const newOverrides: string[] = [];
  const updatedSldEntries: string[] = [];
  let didSplit = false;

  for (let i = 0; i < sldEntries.length; i++) {
    const origEntry = sldEntries[i];
    const slideIndex = i + 1;
    const targetFile = relTargetMap.get(origEntry.rId) || `slides/slide${slideIndex}.xml`;
    const origSlidePath = targetFile.startsWith("ppt/") ? targetFile : `ppt/${targetFile}`;

    updatedSldEntries.push(origEntry.fullTag);

    const origXml = await zip.file(origSlidePath)?.async("string");
    if (!origXml) continue;

    // Check if user specified specific slides or if we auto-detect
    if (options?.forceSlideIndices && !options.forceSlideIndices.has(slideIndex)) {
      continue;
    }

    // Check if slide was already split previously to avoid recursive duplication
    if (/\b(?:Part\s*[12]\/[12]|Part\s*[12]\b|\(1\/2\)|\(2\/2\))/i.test(origXml)) {
      continue;
    }

    // Find table inside slide XML
    const tblRegex = /<a:tbl>([\s\S]*?)<\/a:tbl>/;
    const tblMatch = origXml.match(tblRegex);
    if (!tblMatch) continue;

    const tblXml = tblMatch[0];
    const overflow = inspectTableOverflow(tblXml);
    if (!overflow.shouldSplit && !options?.forceSlideIndices?.has(slideIndex)) {
      continue;
    }

    // Extract all rows
    const rowMatches = Array.from(tblXml.matchAll(/<a:tr\b(?:[\s>][\s\S]*?<\/a:tr>|\/>)/g)).map((m) => m[0]);
    if (rowMatches.length <= 2) continue;

    const splitIdx = overflow.splitIndex;
    const headerRow = rowMatches[0];
    const part1Rows = [headerRow, ...rowMatches.slice(1, splitIdx)];
    const part2Rows = [headerRow, ...rowMatches.slice(splitIdx)];

    // 1. Generate new slide file name
    let newSlideNum = 2000 + slideIndex;
    while (zip.file(`ppt/slides/slide${newSlideNum}.xml`)) newSlideNum++;
    const newSlideTarget = `slides/slide${newSlideNum}.xml`;
    const newSlidePath = `ppt/${newSlideTarget}`;

    // 2. Extract original title text to update title in both parts
    const titleRegex = /<p:sp\b[^>]*>(?:(?!<\/p:sp>)[\s\S])*?<p:ph\b[^>]*type="(?:title|ctrTitle)"[\s\S]*?<\/p:sp>/i;
    let mainTitle = "";
    const titleMatch = origXml.match(titleRegex);
    if (titleMatch) {
      const tTexts = Array.from(titleMatch[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      mainTitle = tTexts.join(" ");
    } else {
      // Check top banner shape
      const bannerMatches = Array.from(origXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g));
      for (const sp of bannerMatches) {
        const off = sp[0].match(/<a:off[^>]*y="(-?\d+)"/);
        const y = off ? parseInt(off[1], 10) : 9999999;
        if (y <= 650000) {
          const tTexts = Array.from(sp[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((m) =>
            m[1].replace(/<[^>]+>/g, "").trim()
          );
          if (tTexts.length > 0) {
            mainTitle = tTexts.join(" ");
            break;
          }
        }
      }
    }

    const titleSuffix1 = options?.partSuffix === "dash" ? " - Part 1" : " (Part 1/2)";
    const titleSuffix2 = options?.partSuffix === "dash" ? " - Part 2" : " (Part 2/2)";

    // Helper to update title text inside a slide XML
    const updateTitleXml = (xml: string, suffix: string): string => {
      if (!mainTitle) return xml;
      const cleanTitle = mainTitle.replace(/\s*\((?:Part\s*)?[12]\/[12]\)/gi, "").replace(/\s*-\s*Part\s*[12]/gi, "").trim();
      const updatedTitle = cleanTitle + suffix;

      let replaced = false;
      return xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (fullMatch, content) => {
        if (!replaced && content.trim() && cleanTitle.includes(content.trim())) {
          replaced = true;
          return fullMatch.replace(content, updatedTitle);
        }
        return fullMatch;
      });
    };

    // 3. Assemble Slide Part 1 XML
    const tblHeaderAndGrid = tblXml.slice(0, tblXml.indexOf(rowMatches[0]));
    const updatedTblXml1 = `${tblHeaderAndGrid}${part1Rows.join("")}</a:tbl>`;
    let part1Xml = origXml.replace(tblRegex, updatedTblXml1);
    part1Xml = updateTitleXml(part1Xml, titleSuffix1);
    zip.file(origSlidePath, part1Xml);

    // 4. Assemble Slide Part 2 XML
    const updatedTblXml2 = `${tblHeaderAndGrid}${part2Rows.join("")}</a:tbl>`;
    let part2Xml = origXml.replace(tblRegex, updatedTblXml2);
    part2Xml = updateTitleXml(part2Xml, titleSuffix2);
    zip.file(newSlidePath, part2Xml);

    // 5. Copy slide .rels if exists (stripping notes & comments to avoid collision)
    const origRelPath = origSlidePath.replace("slides/", "slides/_rels/") + ".rels";
    const relDataStr = await zip.file(origRelPath)?.async("string");
    if (relDataStr) {
      const cleanRelXml = relDataStr.replace(
        /<Relationship\b[^>]*Type="[^"]*(?:\/notesSlide|\/comments)"[^>]*\/>/g,
        ""
      );
      const newRelPath = newSlidePath.replace("slides/", "slides/_rels/") + ".rels";
      zip.file(newRelPath, cleanRelXml);
    }

    // 6. Update Relationships and Content Types for the new slide
    maxRId++;
    maxId++;
    const newRId = `rId${maxRId}`;
    const newSldId = maxId;

    newRels.push(
      `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${newSlideTarget}"/>`
    );
    newOverrides.push(
      `<Override PartName="/ppt/${newSlideTarget}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    );

    // Insert Part 2 slide immediately following Part 1 slide in presentation.xml
    updatedSldEntries.push(`<p:sldId id="${newSldId}" r:id="${newRId}"/>`);
    didSplit = true;

    details.push({
      originalSlideIndex: slideIndex,
      newSlideIndex: slideIndex + 1,
      title: mainTitle || `Slide ${slideIndex}`,
      rowsOnPart1: part1Rows.length - 1,
      rowsOnPart2: part2Rows.length - 1,
    });
  }

  if (didSplit) {
    relsXml = relsXml.replace("</Relationships>", `${newRels.join("")}</Relationships>`);
    presXml = presXml.replace(
      /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
      `<p:sldIdLst>${updatedSldEntries.join("")}</p:sldIdLst>`
    );
    contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);

    zip.file("ppt/_rels/presentation.xml.rels", relsXml);
    zip.file("ppt/presentation.xml", presXml);
    zip.file("[Content_Types].xml", contentTypesXml);
  }

  return { splitCount: details.length, details };
}
