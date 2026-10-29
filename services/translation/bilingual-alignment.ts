/** Structural alignment is evidence of correspondence, never proof of translation quality. */
export interface AlignmentUnit { id: string; text: string }
export interface BilingualScope<T> { key: string; model: string; units: T[] }

export function modelSectionKey(text: string): string | undefined {
  if (/[\r\n]/.test(text)) return undefined;
  const match = text.trim().match(/^(?:[*•#]\s*)?(?:đối\s+với|for|áp\s+dụng\s+cho|apply\s+to|applicable\s+to|dành\s+cho|with\s+(?:the\s+)?cutting\s+die|model\s*[:\-]?|mẫu\s*[:\-]?)\s+(.+)$/iu);
  if (!match || match[1].length > 100 || /^sizes?\b/i.test(match[1])) return undefined;
  const codes = match[1].toUpperCase().match(/[A-Z0-9]+(?:[-–][A-Z0-9]+)+/g);
  return codes?.length ? [...new Set(codes.map(code => code.replace(/–/g, '-')))].sort().join('|') : undefined;
}

export function stepNumber(text: string): string | undefined {
  return text.match(/^\s*(?:[*•#]\s*)?(?:(?:step|bước|ctq|sop|item|mục|trạm)\s*[:#]?\s*)?(\d+(?:\.\d+)?)(?:[.:\-/)]|\s+(?:en|vi|vn)\b)/iu)?.[1];
}

export function isInstructionFragment(text: string): boolean {
  const body = text.trim().replace(/^\s*(?:\d+(?:\.\d+)?[.):\-]\s*)/, '').replace(/[.!?:;]+$/g, '').trim();
  return /^(?:check(?:\s+if)?|inspect|verify|ensure|accept|place|attach|apply|stitch|sew|press|avoid)$/i.test(body);
}

/** Track model sections independently on each language side, including repeated sections. */
export function bilingualScopes<T extends AlignmentUnit>(units: T[], isVi: (text: string) => boolean): BilingualScope<T>[] {
  const current = { vi: 'general', en: 'general' };
  const counts = new Map<string, number>(), scopes = new Map<string, BilingualScope<T>>();
  for (const unit of units) {
    const side = isVi(unit.text) ? 'vi' : 'en';
    const model = modelSectionKey(unit.text);
    if (model) {
      const countKey = `${side}:${model}`;
      const occurrence = (counts.get(countKey) || 0) + 1;
      counts.set(countKey, occurrence);
      current[side] = `${model}#${occurrence}`;
    }
    const key = current[side];
    const scope = scopes.get(key) || { key, model: key === 'general' ? 'general' : key.replace(/#\d+$/, ''), units: [] };
    scope.units.push(unit); scopes.set(key, scope);
  }
  return [...scopes.values()];
}

export function structuralScopePairs<T extends AlignmentUnit>(scope: BilingualScope<T>, isVi: (text: string) => boolean): [T, T][] {
  const result: [T, T][] = [];
  const vi = scope.units.filter(unit => isVi(unit.text)), en = scope.units.filter(unit => !isVi(unit.text));
  const vh = vi.filter(unit => modelSectionKey(unit.text)), eh = en.filter(unit => modelSectionKey(unit.text));
  if (vh.length === 1 && eh.length === 1) result.push([vh[0], eh[0]]);
  const source = vi.filter(unit => !modelSectionKey(unit.text));
  const target = en.filter(unit => !modelSectionKey(unit.text) && !isInstructionFragment(unit.text));
  const byStep = (items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) { const step = stepNumber(item.text); if (step) map.set(step, [...(map.get(step) || []), item]); }
    return map;
  };
  const sourceSteps = byStep(source), targetSteps = byStep(target);
  // The general block needs a complete, unique sequence on both sides. A shared "1" alone is insufficient.
  const completeSequence = source.length >= 2 && source.length === target.length && sourceSteps.size === source.length && targetSteps.size === target.length && [...sourceSteps.keys()].every(step => targetSteps.get(step)?.length === 1);
  if (completeSequence || scope.model !== 'general') {
    for (const [step, candidates] of sourceSteps) {
      const targets = targetSteps.get(step);
      if (candidates.length === 1 && targets?.length === 1) result.push([candidates[0], targets[0]]);
    }
    if (scope.model !== 'general' && source.length === 1 && target.length === 1 && !(stepNumber(source[0].text) && stepNumber(target[0].text) && stepNumber(source[0].text) !== stepNumber(target[0].text))) {
      if (!result.some(([unit]) => unit.id === source[0].id)) result.push([source[0], target[0]]);
    }
  }
  return result;
}
