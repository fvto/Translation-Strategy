const text = `*May gót:
1.Kiểm tra đặt liệu gót ngay tâm eo,tâm giữa gót trùng với đường zigzag eo.May theo lỗ định vị trên eo và biên liệu logo
2.Kiểm tra sau khi may gót thẳng , phần biên gót ôm sát biên logo để tránh tình trạng thành phẩm bị hở/lấp logo.`;

fetch("http://localhost:3000/api/translate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sourceText: text })
})
  .then(r => r.json())
  .then(d => {
    console.log("=== TRANSLATED TEXT ===");
    console.log(d.translatedText);
    console.log("=== MATCHED TERMS ===");
    console.log(d.matchedTerms.map(m => m.matchedText + " (" + m.startIndex + "-" + m.endIndex + ") -> " + m.entry.targetTerm));
  });
