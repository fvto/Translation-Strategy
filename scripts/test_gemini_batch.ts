import { GeminiTranslationProvider } from '../services/translation/gemini';
import { db } from '../services/database/db';

async function test() {
  const settings = db.getSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  console.log('Gemini API key present?', !!apiKey);
  
  const provider = new GeminiTranslationProvider(apiKey, 'gemini-3.5-flash-lite');
  try {
    const res = await provider.translateBatch({
      items: [
        { id: '1', sourceText: '*May mudguard 1,2' },
        { id: '2', sourceText: '1.Điều chỉnh cử máy may cách biên 1.5mm,khoảng cách 2 kim 1.8mm,cách kim 9-10 mũi/inch' },
        { id: '3', sourceText: '1.Đảm bảo khuôn phải được đặt cố định trên máy' }
      ],
      sourceLanguage: 'vi',
      targetLanguage: 'en',
    });
    console.log('Batch translate result:');
    for (const [id, text] of res.results.entries()) {
      console.log(`  [${id}]: "${text}"`);
    }
  } catch (e: any) {
    console.error('Gemini error:', e.message);
  }
}

test().catch(console.error);
