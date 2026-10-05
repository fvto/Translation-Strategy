import { GoogleTranslationProvider } from '../services/translation/google';

async function test() {
  const provider = new GoogleTranslationProvider();
  
  const testItems = [
    "*May mudguard 1,2",
    "1.Điều chỉnh cử máy may cách biên 1.5mm,khoảng cách 2 kim 1.8mm,cách kim 9-10 mũi/inch",
    "1.Đảm bảo khuôn phải được đặt cố định trên máy",
    "1.Bàn chảy và keo được thay đổi theo thời gian",
    "Rocking-Độ ổn định",
    "Cleaness-Vệ sinh",
    "X-ray-Cộm"
  ];
  
  for (const item of testItems) {
    try {
      const res = await provider.translate({
        sourceText: item,
        sourceLanguage: 'vi',
        targetLanguage: 'en',
      });
      console.log(`[ORIG]: "${item}"`);
      console.log(`[TRANS]: "${res.translatedText}"\n`);
    } catch (e) {
      console.error(`Error on "${item}":`, e);
    }
  }
}

test().catch(console.error);
