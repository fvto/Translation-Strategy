type Reference = { qualifier: string; sheet?: string; col: string; row: string };
const referencePattern = /^(?:('(?:[^']|'')+'|(?:\[[^\]]+\])?[\p{L}_\\][\p{L}\p{N}_.\\]*(?::[\p{L}_\\][\p{L}\p{N}_.\\]*)?)!)?(\$?[A-Za-z]{1,3})(\$?\d+)?/u;

/** Walk references without treating string literals, structured references or function names as cells. */
function rewriteReferences(formula: string, rewrite: (reference: Reference) => string): string {
  let result = "", i = 0;
  let rangeSheet: string | undefined;
  while (i < formula.length) {
    if (formula[i] === '"') {
      const start = i++;
      while (i < formula.length) {
        if (formula[i++] === '"') {
          if (formula[i] === '"') i++;
          else break;
        }
      }
      result += formula.slice(start, i);
      rangeSheet = undefined;
      continue;
    }
    const previous = formula[i - 1] || "";
    const match = !/[\p{L}\p{N}_.]/u.test(previous) ? formula.slice(i).match(referencePattern) : null;
    if (match) {
      const [raw, quotedSheet, col, row = ""] = match;
      const next = formula.slice(i + raw.length);
      const isColumnRange = !row && (next.startsWith(":") || previous === ":");
      if ((row || isColumnRange) && !/^[\p{L}\p{N}_.\[]/u.test(next) && !/^\s*\(/.test(next)) {
        const sheet = quotedSheet ? quotedSheet.replace(/^'|'$/g, "").replace(/''/g, "'") : previous === ":" ? rangeSheet : undefined;
        result += rewrite({ qualifier: quotedSheet ? `${quotedSheet}!` : "", sheet, col, row });
        rangeSheet = next.startsWith(":") ? sheet : undefined;
        i += raw.length;
        continue;
      }
    }
    if (formula[i] === "[") {
      let depth = 0;
      do {
        const ch = formula[i++];
        result += ch;
        if (ch === "[") depth++;
        if (ch === "]") depth--;
      } while (i < formula.length && depth > 0);
      continue;
    }
    result += formula[i++];
    if (formula[i - 1] !== ":") rangeSheet = undefined;
  }
  return result;
}

function columnNumber(col: string): number {
  return [...col.replace("$", "").toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}
function columnName(index: number): string {
  let value = "";
  for (; index > 0; index = Math.floor((index - 1) / 26)) value = String.fromCharCode(65 + (index - 1) % 26) + value;
  return value;
}

export function shiftFormulaColumns(formula: string, insertedColIdx: number, shiftCount = 1, context?: { formulaSheetName: string; shiftedSheetName: string }): string {
  if (!formula) return formula;
  return rewriteReferences(formula, ({ qualifier, sheet, col, row }) => {
    const targetSheet = sheet ?? context?.formulaSheetName;
    const applies = context ? targetSheet?.toLowerCase() === context.shiftedSheetName.toLowerCase() : sheet === undefined;
    const index = columnNumber(col);
    const shifted = applies && index >= insertedColIdx ? (col.startsWith("$") ? "$" : "") + columnName(index + shiftCount) : col;
    return qualifier + shifted + row;
  });
}

export function renameFormulaSheets(formula: string, names: Map<string, string>): string {
  const lookup = new Map([...names].map(([from, to]) => [from.toLowerCase(), to]));
  return rewriteReferences(formula, ({ qualifier, sheet, col, row }) => {
    const name = qualifier && sheet ? lookup.get(sheet.toLowerCase()) : undefined;
    return (name ? `'${name.replace(/'/g, "''")}'!` : qualifier) + col + row;
  });
}

export function uniqueSheetName(original: string, suffix: string, used: Set<string>): string {
  let sequence = 0;
  let name: string;
  do {
    const tail = `${sequence ? ` ${sequence}` : ""}${suffix}`;
    name = original.slice(0, 31 - tail.length) + tail;
    sequence++;
  } while (used.has(name.toLowerCase()));
  used.add(name.toLowerCase());
  return name;
}
