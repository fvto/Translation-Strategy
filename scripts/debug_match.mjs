// Debug: check what terminology matches for "đường may"
const text = "Kiểm tra chất lượng đường may.";

async function main() {
  const res = await fetch('http://localhost:3000/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceText: text,
      sourceLanguage: 'vi',
      targetLanguage: 'en',
    }),
  });

  const data = await res.json();
  console.log('SOURCE:', text);
  console.log('RESULT:', data.translatedText);
  console.log('\nMatched terms (sorted by position):');
  if (data.matchedTerms) {
    data.matchedTerms.forEach(m => {
      console.log(`  pos ${m.startIndex}-${m.endIndex}: "${m.matchedText}" -> "${m.entry.targetTerm}" [${m.entry.sourceTerm}] (priority: ${m.entry.priority})`);
    });
  }
}

main();
