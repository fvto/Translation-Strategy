import JSZip from 'jszip';
import fs from 'fs';
import { hasViDiacritics } from '../services/documents/pptx-translator';

async function test() {
  const origPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.orig.pptx';
  const transPath = 'data/secure_storage/pptx_sessions/pptx_1790321264805_4d2b88a4.trans.pptx';
  
  const origZip = await JSZip.loadAsync(fs.readFileSync(origPath));
  const transZip = await JSZip.loadAsync(fs.readFileSync(transPath));
  
  const presXml = await origZip.file('ppt/presentation.xml')!.async('string');
  const sldIdLst = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '';
  const rIds = [...sldIdLst.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
  const relsXml = await origZip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  const idMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]*slide"\s+Target="([^"]+)"/g)) {
    idMap.set(m[1], m[2]);
  }
  
  console.log(`=== AUDITING SESSION pptx_1790321264805_4d2b88a4 (86 slides) ===\n`);
  
  let totalMissingParas = 0;
  let totalUntranslated = 0;

  for (let i = 0; i < rIds.length; i++) {
    const target = idMap.get(rIds[i])!;
    const origXml = await origZip.file(`ppt/${target}`)?.async('string');
    const transXml = await transZip.file(`ppt/${target}`)?.async('string');
    if (!origXml || !transXml) continue;
    
    const getPs = (xml: string) => {
      const ps: string[] = [];
      const matches = xml.match(/<a:p(?:[\s>][\s\S]*?<\/a:p>|\/>)/g) || [];
      for (const m of matches) {
        const ts = (m.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) || [])
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
        if (ts.length > 0) ps.push(ts.join(' '));
      }
      return ps;
    };
    
    const origPs = getPs(origXml);
    const transPs = getPs(transXml);
    
    // Check missing paragraphs
    // If orig had numbered steps e.g. "1.", "2.", "3." but trans has fewer or none:
    const origSteps = origPs.filter(p => /^\d+\./.test(p));
    const transSteps = transPs.filter(p => /^\d+\./.test(p));
    
    const issues: string[] = [];
    
    if (origSteps.length > transSteps.length) {
      issues.push(`MISSING STEPS: had ${origSteps.length} steps, but trans has ${transSteps.length} steps`);
      totalMissingParas += (origSteps.length - transSteps.length);
    } else if (origPs.length > transPs.length + 2) {
      issues.push(`FEWER PARAS: orig has ${origPs.length}, trans has ${transPs.length}`);
    }
    
    // Check remaining Vietnamese diacritics
    const viLeft = transPs.filter(p => hasViDiacritics(p));
    if (viLeft.length > 0) {
      issues.push(`VIETNAMESE REMAINING (${viLeft.length} items): ${viLeft.slice(0, 2).map(x => `"${x.slice(0, 40)}"`).join(', ')}`);
      totalUntranslated += viLeft.length;
    }
    
    // Check specific untranslated terms without diacritics (like "*May mudguard", "May", "Quet keo")
    const untranslatedTerms = transPs.filter(p => /\b(may|dan|mai|keo)\b/i.test(p) && !hasViDiacritics(p));
    if (untranslatedTerms.length > 0) {
      issues.push(`UNTRANSLATED NON-ACCENT TERMS (${untranslatedTerms.length} items): ${untranslatedTerms.slice(0, 2).map(x => `"${x.slice(0, 40)}"`).join(', ')}`);
    }
    
    if (issues.length > 0) {
      console.log(`Slide #${i + 1} (${target}):`);
      issues.forEach(iss => console.log(`   * ${iss}`));
    }
  }
  
  console.log(`\nAudit completed: total missing steps = ${totalMissingParas}, total untranslated with diacritics = ${totalUntranslated}`);
}

test().catch(console.error);
