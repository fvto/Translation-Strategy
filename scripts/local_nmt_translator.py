# scripts/local_nmt_translator.py
"""
100% Offline Local Neural Machine Translator using CTranslate2 + NLLB-200 (INT8).
- ~500MB RAM usage
- Runs directly on CPU (no GPU required)
- Zero API keys, Zero Quota, Zero Network after initial download
"""

import sys
import json
import os
import re

# Ensure standard UTF-8 I/O for Windows terminal / Node child process
try:
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Footwear Domain Terminology Post-processor
FOOTWEAR_REPLACEMENTS = [
    (re.compile(r'\bNosew\b'), 'No-sew'),
    (re.compile(r'\bnosew\b'), 'no-sew'),
    (re.compile(r'không đan', re.IGNORECASE), 'No-sew'),
    (re.compile(r'không may\b', re.IGNORECASE), 'No-sew'),
    (re.compile(r'mũi khâu/inch', re.IGNORECASE), 'mũi/inch'),
    (re.compile(r'gù/inch', re.IGNORECASE), 'mũi/inch'),
    (re.compile(r'hình dạng đầu tip', re.IGNORECASE), 'hình dạng mũi giày'),
    (re.compile(r'hình dạng đầu\b', re.IGNORECASE), 'hình dạng mũi giày'),
    (re.compile(r'hình dạng mẹo', re.IGNORECASE), 'hình dạng mũi giày'),
    (re.compile(r'năm tài khóa 27', re.IGNORECASE), 'FY27'),
    (re.compile(r'năm tài khóa 26', re.IGNORECASE), 'FY26'),
    (re.compile(r'năm tài khóa 25', re.IGNORECASE), 'FY25'),
    (re.compile(r'Động cơ cải tiến liên tục', re.IGNORECASE), 'Thúc đẩy cải tiến liên tục'),
    (re.compile(r'văn hóa không khuyết tật', re.IGNORECASE), 'văn hóa không sai hỏng (zero-defect)'),
    (re.compile(r'dây chuyền lắp ráp đơn\b', re.IGNORECASE), 'chuyền lắp ráp đế giày')
]

ENGLISH_REPLACEMENTS = [
    (re.compile(r'\bNosew\b'), 'No-sew'),
    (re.compile(r'\bnosew\b'), 'no-sew'),
    (re.compile(r'\bshape tip\b', re.IGNORECASE), 'Tip shape'),
    (re.compile(r'\bshape toe\b', re.IGNORECASE), 'Toe shape'),
    (re.compile(r'\bshape collar\b', re.IGNORECASE), 'Collar shape'),
    (re.compile(r'\bshape heel\b', re.IGNORECASE), 'Heel shape'),
    (re.compile(r'\b(?:the\s+)?right\s+(?:foot|shoulder)\b', re.IGNORECASE), 'sole heating'),
    (re.compile(r'\bheating\s+of\s+the\s+right\s+shoe\b', re.IGNORECASE), 'sole heating'),
    (re.compile(r'\bscanning\s+the\s+sole\b', re.IGNORECASE), 'smoothly and evenly'),
    (re.compile(r'\bWorkers\'\s+work\b', re.IGNORECASE), 'Worker operation'),
]

VIETNAMESE_PREPROCESSORS = [
    (re.compile(r'\bhơ\s+đế\b', re.IGNORECASE), 'sole heating'),
    (re.compile(r'\bsuôn\s+đều\b', re.IGNORECASE), 'smoothly and evenly'),
    (re.compile(r'\bđường\s+quét\s+keo\b', re.IGNORECASE), 'cement line'),
    (re.compile(r'\bthao\s+tác\s+công\s+nhân\b', re.IGNORECASE), 'Worker operation'),
    (re.compile(r'\bgiày\s+thành\s+phẩm\b', re.IGNORECASE), 'finished shoes'),
]

def pre_process_vietnamese(text: str) -> str:
    if not text:
        return ""
    res = text
    for pattern, sub in VIETNAMESE_PREPROCESSORS:
        res = pattern.sub(sub, res)
    return res

def post_process_vietnamese(text: str) -> str:
    if not text:
        return ""
    res = text.strip()
    for pattern, sub in FOOTWEAR_REPLACEMENTS:
        res = pattern.sub(sub, res)
    res = re.sub(r'\b(\d+(?:-\d+)?)\s*SPI\b', r'SPI \1 mũi/inch', res, flags=re.IGNORECASE)
    return res

def post_process_english(text: str) -> str:
    if not text:
        return ""
    res = text.strip()
    for pattern, sub in ENGLISH_REPLACEMENTS:
        res = pattern.sub(sub, res)
    res = re.sub(r'\b(\d+(?:-\d+)?)\s*SPI\b', r'SPI \1 stitches/inch', res, flags=re.IGNORECASE)
    return res

_translator = None
_tokenizer = None

def get_nmt_engine():
    global _translator, _tokenizer
    if _translator is not None and _tokenizer is not None:
        return _translator, _tokenizer

    import ctranslate2
    from transformers import AutoTokenizer
    from huggingface_hub import snapshot_download

    model_name = "JustFrederik/nllb-200-distilled-600M-ct2-int8"
    model_dir = snapshot_download(model_name)

    _tokenizer = AutoTokenizer.from_pretrained(model_dir, src_lang="eng_Latn")
    _translator = ctranslate2.Translator(
        model_dir,
        device="cpu",
        compute_type="int8",
        inter_threads=2,
        intra_threads=4
    )
    return _translator, _tokenizer

def translate_batch(items):
    """
    items: list of dicts [{'id': '...', 'text': '...'}]
    returns: list of dicts [{'id': '...', 'translatedText': '...'}]
    """
    if not items:
        return []

    try:
        translator, tokenizer = get_nmt_engine()
        results = []

        tokens_batch = []
        target_prefix = []
        for it in items:
            t = it['text']
            src_lang = it.get('src', 'eng_Latn')
            tgt_lang = it.get('tgt', 'vie_Latn')
            if src_lang == 'vie_Latn':
                t = pre_process_vietnamese(t)
            
            tokenizer.src_lang = src_lang
            tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(t))
            tokens_batch.append(tokens)
            target_prefix.append([tgt_lang])

        trans_res = translator.translate_batch(tokens_batch, target_prefix=target_prefix, max_batch_size=16)

        for i, it in enumerate(items):
            hyp = trans_res[i].hypotheses[0]
            tgt_lang = it.get('tgt', 'vie_Latn')
            if hyp and hyp[0] == tgt_lang:
                hyp = hyp[1:]
            out_text = tokenizer.decode(tokenizer.convert_tokens_to_ids(hyp))
            
            if tgt_lang == 'vie_Latn':
                out_text = post_process_vietnamese(out_text)
            elif tgt_lang == 'eng_Latn':
                out_text = post_process_english(out_text)
                
            results.append({
                'id': it['id'],
                'translatedText': out_text
            })
        return results

    except Exception as e:
        sys.stderr.write(f"Local NMT error: {e}\n")
        return [{'id': it['id'], 'translatedText': it['text']} for it in items]

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        sample = [
            {"id": "1", "text": "Drive continuous improvement in sole assembly line"},
            {"id": "2", "text": "Inspect tip shape and verify SPI 10-12 stitches/inch"}
        ]
        out = translate_batch(sample)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        sys.exit(0)

    input_data = ""
    if len(sys.argv) > 1 and sys.argv[1].startswith('['):
        input_data = sys.argv[1]
    else:
        input_data = sys.stdin.read()

    if not input_data.strip():
        sys.exit(0)

    try:
        items = json.loads(input_data)
        out = translate_batch(items)
        print(json.dumps(out, ensure_ascii=False))
    except Exception as err:
        sys.stderr.write(f"JSON error: {err}\n")
        sys.exit(1)
