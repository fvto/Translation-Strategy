export interface FootwearAcronym {
  acronym: string;
  fullNameEn: string;
  meaningVi: string;
  forbiddenTranslations: string[];
}

export const FOOTWEAR_ACRONYMS: FootwearAcronym[] = [
  {
    acronym: "O/S",
    fullNameEn: "Outsole",
    meaningVi: "Đế ngoài",
    forbiddenTranslations: ["Operating System", "Open Source", "OS"],
  },
  {
    acronym: "M/S",
    fullNameEn: "Midsole",
    meaningVi: "Đế trung",
    forbiddenTranslations: ["Microsoft", "MS", "Milliseconds"],
  },
  {
    acronym: "BTM",
    fullNameEn: "Bottom",
    meaningVi: "Cụm đế",
    forbiddenTranslations: ["Bitcoin", "ATM", "Bathroom"],
  },
  {
    acronym: "WB",
    fullNameEn: "Water-based cement",
    meaningVi: "Keo gốc nước",
    forbiddenTranslations: ["Warner Bros", "Warner Brothers", "World Bank"],
  },
  {
    acronym: "HFW",
    fullNameEn: "High-Frequency Welding",
    meaningVi: "Ép cao tần",
    forbiddenTranslations: ["Heavy Forged Weapon", "Hardware"],
  },
  {
    acronym: "OB",
    fullNameEn: "Over buffing",
    meaningVi: "Mài cao / Mài quá mức",
    forbiddenTranslations: ["Obstetrics", "Out of Bounds"],
  },
  {
    acronym: "UB",
    fullNameEn: "Under buffing",
    meaningVi: "Mài thiếu",
    forbiddenTranslations: ["University of Buffalo", "Ultra Boost"],
  },
  {
    acronym: "CF",
    fullNameEn: "Color fastness",
    meaningVi: "Độ bền màu",
    forbiddenTranslations: ["CrossFit", "CompactFlash", "Carbon Fiber"],
  },
  {
    acronym: "TLM",
    fullNameEn: "Thermal lasting machine",
    meaningVi: "Máy gò nhiệt",
    forbiddenTranslations: ["Telemetry", "Too Long Moved"],
  },
  {
    acronym: "CTQ",
    fullNameEn: "Critical To Quality",
    meaningVi: "Điểm chất lượng then chốt",
    forbiddenTranslations: ["CTQ", "City of"],
  },
  {
    acronym: "ISQ",
    fullNameEn: "In-Station Quality",
    meaningVi: "Chất lượng tại trạm",
    forbiddenTranslations: ["Information Systems Quality"],
  },
  {
    acronym: "IPQC",
    fullNameEn: "In-Process Quality Control",
    meaningVi: "Kiểm soát chất lượng trên chuyền",
    forbiddenTranslations: ["IP Quality"],
  },
  {
    acronym: "EVA",
    fullNameEn: "Ethylene-Vinyl Acetate (EVA)",
    meaningVi: "Vật liệu đế EVA",
    forbiddenTranslations: ["Eva", "Extravehicular"],
  },
  {
    acronym: "PU",
    fullNameEn: "Polyurethane (PU)",
    meaningVi: "Nhựa PU",
    forbiddenTranslations: ["Public Unit", "Plutonium"],
  },
  {
    acronym: "TPU",
    fullNameEn: "Thermoplastic Polyurethane (TPU)",
    meaningVi: "Nhựa TPU",
    forbiddenTranslations: ["Tensor Processing Unit"],
  },
];

/**
 * Scans input text and returns relevant acronym context instructions for AI prompts.
 */
export function buildAcronymPromptDirective(text: string): string {
  if (!text) return "";
  const detected: FootwearAcronym[] = [];

  for (const item of FOOTWEAR_ACRONYMS) {
    const escaped = item.acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^\\w])${escaped}(?:[^\\w]|$)`, "i");
    if (regex.test(text)) {
      detected.push(item);
    }
  }

  if (detected.length === 0) return "";

  const lines = detected.map((d) => {
    const forbidden = d.forbiddenTranslations.length > 0
      ? ` (NEVER translate to: ${d.forbiddenTranslations.map(f => `"${f}"`).join(", ")})`
      : "";
    return `- "${d.acronym}" refers to footwear "${d.fullNameEn}" (${d.meaningVi})${forbidden}`;
  });

  return [
    "FOOTWEAR FACTORY ACRONYM CONTEXT (STRICT COMPLIANCE REQUIRED):",
    ...lines,
    "Do NOT alter or mistranslate factory engineering codes.",
  ].join("\n");
}

/**
 * Post-processes translated text to catch and repair forbidden LLM hallucinated acronym translations.
 */
export function repairMistranslatedAcronyms(text: string): string {
  if (!text) return text;
  let repaired = text;

  // 1. Repair Operating System -> Outsole
  repaired = repaired.replace(/\boperating\s+systems?\b/gi, "Outsole");

  // 2. Repair Warner Bros / Warner Brothers -> Water-based cement
  repaired = repaired.replace(/\bwarner\s+bro(?:ther)?s?\b/gi, "Water-based cement");

  // 3. Repair Tensor Processing Unit -> Thermoplastic Polyurethane
  repaired = repaired.replace(/\btensor\s+processing\s+units?\b/gi, "TPU");

  return repaired;
}
