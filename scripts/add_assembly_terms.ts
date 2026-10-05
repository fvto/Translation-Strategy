import { db } from "../services/database/db";

const termsToAdd = [
  {
    sourceTerm: "hơ đế",
    targetTerm: "sole heating",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Assembly",
    status: "approved" as const,
    priority: 1,
    confidence: 1.0,
    createdBy: "system_footwear_sop",
    definition: "Quy trình sấy nóng/gia nhiệt đế giày trước khi dán keo ép đế"
  },
  {
    sourceTerm: "suôn đều",
    targetTerm: "smoothly and evenly",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Assembly",
    status: "approved" as const,
    priority: 1,
    confidence: 1.0,
    createdBy: "system_footwear_sop",
    definition: "Thao tác vuốt/dán êm, phẳng và đều theo đường keo"
  },
  {
    sourceTerm: "dán đế",
    targetTerm: "sole attaching",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Assembly",
    status: "approved" as const,
    priority: 1,
    confidence: 1.0,
    createdBy: "system_footwear_sop",
    definition: "Thao tác ép/dán đế giày vào thân giày"
  },
  {
    sourceTerm: "đường quét keo",
    targetTerm: "cement line",
    sourceLanguage: "vi",
    targetLanguage: "en",
    category: "Assembly",
    status: "approved" as const,
    priority: 1,
    confidence: 1.0,
    createdBy: "system_footwear_sop",
    definition: "Đường biên quét keo/nước thuốc chuẩn trên đế và mặt giày"
  }
];

const res = db.addTerminology(termsToAdd);
console.log("Successfully added terms count:", res.length);
const verified = db.getApprovedTerminology("vi", "en").filter(t => 
  ["hơ đế", "suôn đều", "dán đế", "đường quét keo"].includes(t.sourceTerm)
);
console.log("Verified in approved glossary:", verified.map(t => `${t.sourceTerm} -> ${t.targetTerm}`));
