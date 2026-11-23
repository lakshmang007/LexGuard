"""Detect the script a document is written in, so non-English text is not scored.

The rules only read English. A Hindi or Kannada document gives 0 sentences and
0 flags, which would look like "LOW risk"; the UI uses this result to say so instead.
"""
from collections import Counter

MIN_LETTERS = 20  # too few letters to judge (a title, a number list): assume English

# (script, code-point ranges). Order breaks ties, so Latin wins an even split.
SCRIPTS = [
    ("Latin", [(0x0000, 0x024F), (0x1E00, 0x1EFF)]),  # ASCII, Latin-1, Extended-A/B, Additional
    ("Devanagari", [(0x0900, 0x097F)]),
    ("Bengali", [(0x0980, 0x09FF)]),
    ("Gurmukhi", [(0x0A00, 0x0A7F)]),
    ("Gujarati", [(0x0A80, 0x0AFF)]),
    ("Odia", [(0x0B00, 0x0B7F)]),
    ("Tamil", [(0x0B80, 0x0BFF)]),
    ("Telugu", [(0x0C00, 0x0C7F)]),
    ("Kannada", [(0x0C80, 0x0CFF)]),
    ("Malayalam", [(0x0D00, 0x0D7F)]),
    ("Arabic", [(0x0600, 0x06FF)]),
    ("CJK", [(0x4E00, 0x9FFF), (0x3040, 0x30FF), (0xAC00, 0xD7AF)]),
]
ORDER = [name for name, _ in SCRIPTS] + ["Other"]


def script_of(ch):
    cp = ord(ch)
    for name, ranges in SCRIPTS:
        if any(lo <= cp <= hi for lo, hi in ranges):
            return name
    return "Other"


def detect(text):
    # Count each distinct character once, so a long page costs one pass in C, not one per letter.
    counts = Counter()
    for ch, n in Counter(text).items():
        if ch.isalpha():  # letters only: vowel signs, digits and punctuation do not count
            counts[script_of(ch)] += n
    letters = sum(counts.values())
    latin = counts["Latin"]
    script = "Latin"
    for name in ORDER:
        if counts[name] > counts[script]:
            script = name
    return {
        "supported": letters < MIN_LETTERS or latin * 2 >= letters,
        "script": script,
        # Half-up in integers, so Python and JavaScript round the same way.
        "latin_share": (200 * latin + letters) // (2 * letters) / 100 if letters else 1.0,
    }
