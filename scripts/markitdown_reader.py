import sys
import json
from markitdown import MarkItDown

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

def parse_pptx(file_path):
    md = MarkItDown()
    result = md.convert(file_path)
    return {
        "markdown": result.text_content,
        "title": getattr(result, "title", None)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    try:
        data = parse_pptx(file_path)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
