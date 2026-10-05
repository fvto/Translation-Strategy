import { GoogleTranslationProvider } from '../services/translation/google';

async function test() {
  const provider = new GoogleTranslationProvider();
  
  const testBatch = [
    { id: '1', sourceText: '*May mudguard 1,2' },
    { id: '2', sourceText: '1.Đặt liệu mudguard khớp rập' },
    { id: '3', sourceText: '2.Đặt liệu mudguard vào eo may ngay tâm giữa để tránh tình trạng qua thành hình bị nhăn eo ,' },
    { id: '4', sourceText: '3.Kiểm tra sau khi may mudguard 2 phải ngay tâm để ô dê không bị cao thấp , cách biên 1.5mm 9-10 mũi /inch' },
    { id: '5', sourceText: 'Rocking-Độ ổn định' },
    { id: '6', sourceText: 'Cleaness-Vệ sinh' },
    { id: '7', sourceText: '1.Bàn chảy và keo được thay đổi theo thời gian' }
  ];
  
  const results = await Promise.all(testBatch.map(async it => {
    const res = await provider.translate({
      sourceText: it.sourceText,
      sourceLanguage: 'vi',
      targetLanguage: 'en'
    });
    return { id: it.id, orig: it.sourceText, trans: res.translatedText };
  }));
  
  console.log('Results:');
  results.forEach(r => console.log(`  [${r.id}] "${r.orig}" -> "${r.trans}"`));
}

test().catch(console.error);
