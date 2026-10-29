const LETTERS: Record<string, string[]> = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
};

export function NothingWordmark() {
  return <svg viewBox="0 0 179 21" className="n-wordmark" role="img" aria-label="Translator">{Array.from("TRANSLATOR").flatMap((letter, index) => LETTERS[letter].flatMap((row, y) => Array.from(row).map((dot, x) => dot === "1" ? <circle key={`${index}-${x}-${y}`} cx={index * 18 + x * 3 + 1} cy={y * 3 + 1} r="0.95" fill="currentColor" /> : null)))}</svg>;
}

export function NothingWorkspaceHero() {
  return <section className="n-hero" aria-labelledby="workspace-heading">
    <div className="n-hero-copy"><p className="n-eyebrow">CHINGLUH / TRANSLATION WORKSPACE</p><h1 id="workspace-heading">Mỗi tài liệu.<br /><em>Một tiếng nói.</em></h1><p>Dịch đúng thuật ngữ. Giữ trọn ý nghĩa.<br />Một không gian cho văn bản, slide và bảng tính.</p></div>
    <div className="n-hero-art" aria-hidden="true"><div className="n-document n-document-back" /><div className="n-document n-document-middle" /><div className="n-document n-document-front"><span className="n-document-label">VI → EN</span><span className="n-document-symbol">Aa<span>↗</span></span><div className="n-document-lines"><i /><i /><i /><i /></div><span className="n-document-end">SOP / CHINGLUH <i /></span></div></div>
    <span className="n-hero-corner">( TEXT / POWERPOINT / EXCEL )</span>
  </section>;
}
