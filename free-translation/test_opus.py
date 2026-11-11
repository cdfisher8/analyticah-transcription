"""Evaluate commercially permissive OPUS-MT English/Afrikaans models locally.

Run: pip install "transformers>=4.40,<5" torch sentencepiece
     python free-translation/test_opus.py

Downloads model weights on first use. Do not run on GitHub Pages.
Check each model card/licence before deployment.
"""
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODELS = {
    ("en", "af"): "Helsinki-NLP/opus-mt-en-af",
    ("af", "en"): "Helsinki-NLP/opus-mt-af-en",
}
TESTS = [
    ("en", "af", "Good morning. We will begin the meeting now."),
    ("en", "af", "The invoice total is 1250 rand."),
    ("af", "en", "Goeiemôre. Ons begin nou met die vergadering."),
    ("af", "en", "Die faktuur is reeds betaal."),
]

def main():
    loaded = {}
    for source, target, sentence in TESTS:
        model_id = MODELS[(source, target)]
        if model_id not in loaded:
            tokenizer = AutoTokenizer.from_pretrained(model_id)
            model = AutoModelForSeq2SeqLM.from_pretrained(model_id)
            loaded[model_id] = (tokenizer, model)
        tokenizer, model = loaded[model_id]
        inputs = tokenizer(sentence, return_tensors="pt", truncation=True)
        outputs = model.generate(**inputs, max_new_tokens=128)
        translated = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
        print(f"{source} -> {target}: {sentence}\n  {translated}\n")
    print("Outputs require human review. isiZulu model not verified and is not included.")

if __name__ == "__main__":
    main()
