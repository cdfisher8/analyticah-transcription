"""Local, non-commercial evaluation of AfriNLLB. NOT for production deployment.

Install in a Python virtual environment:
  pip install "transformers>=4.40,<5" torch sentencepiece
Run:
  python free-translation/test_afrinllb.py

Downloads model weights on first run; needs significant disk space/RAM.
Model licence: CC BY-NC 4.0. Obtain appropriate permission before commercial use.
"""
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL_ID = "AfriNLP/AfriNLLB-12enc-4dec-iterative-481m-ft"
LANGUAGES = {"en": "eng_Latn", "af": "afr_Latn", "zu": "zul_Latn"}
SAMPLES = [
    ("en", "af", "Good morning. We will begin the meeting now."),
    ("en", "zu", "Good morning. We will begin the meeting now."),
    ("af", "en", "Goeiemôre. Ons begin nou met die vergadering."),
    ("zu", "en", "Sawubona. Siqala umhlangano manje."),
]

def main():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID)
    for source, target, sentence in SAMPLES:
        tokenizer.src_lang = LANGUAGES[source]
        inputs = tokenizer(sentence, return_tensors="pt", truncation=True)
        forced_id = tokenizer.convert_tokens_to_ids(LANGUAGES[target])
        if forced_id == tokenizer.unk_token_id:
            raise ValueError(f"Unsupported target language: {target}")
        outputs = model.generate(**inputs, forced_bos_token_id=forced_id, max_new_tokens=128)
        translated = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
        print(f"{source} -> {target}\n  Input: {sentence}\n  Output: {translated}\n")
    print("Review translations with fluent speakers; printing output does not validate accuracy.")

if __name__ == "__main__":
    main()
