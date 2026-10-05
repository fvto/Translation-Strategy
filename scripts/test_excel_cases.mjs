// Test comprehensive manufacturing sentences from Cuu-am-chan-kinh.xlsx
const testSentences = [
  {
    name: "Strap & Jig alignment",
    text: "Quai dép không khớp rập vẽ lệch.",
  },
  {
    name: "Over cement wiping instruction",
    text: "Keo tràn phải lập tức dùng vải lau.",
  },
  {
    name: "Defects: blooming, broken edge, color bleeding",
    text: "Đế cao su nổi váng trắng, bể biên và lem màu.",
  },
  {
    name: "Defect inspection: marking, air bubble, flow mark",
    text: "Kiểm tra phát hiện cấn, bọt khí và ly hình.",
  },
  {
    name: "Pressing & hammer instruction",
    text: "Điều chỉnh máy dập bằng 2 trụ dập phải sát mặt giày khi dập, dập bằng phải suôn đều.",
  },
  {
    name: "Edge and gap quality",
    text: "Kiểm tra khe hở/hở biên và dán đế phải chặt.",
  },
];

async function run() {
  for (const t of testSentences) {
    const res = await fetch('http://localhost:3000/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceText: t.text,
        sourceLanguage: 'vi',
        targetLanguage: 'en',
      }),
    });
    const data = await res.json();
    console.log(`\n[${t.name}]`);
    console.log(`VN: ${t.text}`);
    console.log(`EN: ${data.translatedText}`);
    console.log(`Matched: ${(data.matchedTerms || []).map(m => m.entry.sourceTerm + '->' + m.entry.targetTerm).join(', ')}`);
  }
}

run();
