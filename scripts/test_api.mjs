// Comprehensive VI -> EN translation test
const tests = [
  {
    name: "Test 1: Strobel cutting",
    text: `*Bao trung đế sau khi cắt laze.
1.Kiểm tra đường cắt laze cách biên trung đế.
2.Các lỗ cắt laze phải đúng tiêu chuẩn file.
3.Kiểm tra bao trung đế.`,
  },
  {
    name: "Test 2: Quality check",
    text: `Kiểm tra chất lượng đường may.
Đường may phải đúng tiêu chuẩn.
Không được thiếu lỗ đục.`,
  },
  {
    name: "Test 3: Manufacturing instructions",
    text: `Sau khi mài, dùng ống hơi thổi sạch bụi.
Kiểm tra khoảng cách 2 đường chỉ may.
Dán đế phải chặt, không bị hở biên.`,
  },
  {
    name: "Test 4: EN -> VI (reverse)",
    text: `The organization must complete a comprehensive Risk Assessment annually in accordance with ISO 27001 and NIST CSF standards.`,
  },
];

async function main() {
  for (const t of tests) {
    const isVi = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(t.text);

    try {
      const res = await fetch('http://localhost:3000/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: t.text,
          sourceLanguage: isVi ? 'vi' : 'en',
          targetLanguage: isVi ? 'en' : 'vi',
        }),
      });

      const data = await res.json();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${t.name} (${isVi ? 'VI→EN' : 'EN→VI'})`);
      console.log(`${'='.repeat(60)}`);
      console.log('SOURCE:', t.text.replace(/\n/g, ' | '));
      console.log('RESULT:', data.translatedText?.replace(/\n/g, ' | '));
      console.log(`TERMS:  ${(data.matchedTerms || []).length} matched`);
      console.log(`TIME:   ${data.durationMs}ms`);
    } catch (e) {
      console.error(`${t.name} ERROR:`, e.message);
    }
  }
}

main();
