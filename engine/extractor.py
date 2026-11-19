"""Agent 1 - Extractor: split a document into numbered clauses.

Every clause keeps its exact character span in the original text, so any
flag can be traced back to (and highlighted in) the source sentence.
"""
import re

# Words ending in "." that do not end a sentence.
ABBREVIATIONS = {
    "rs", "no", "nos", "e.g", "i.e", "etc", "mr", "mrs", "ms", "dr", "st", "vs",
    "pvt", "ltd", "co", "inc", "approx", "dept", "sec", "s", "art", "cl", "p.a",
    "a.m", "p.m", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept",
    "oct", "nov", "dec", "fig", "max", "min", "govt", "u.s",
}

PARAGRAPH = re.compile(r"[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*")
# A new line that starts with numbering or a bullet begins a new block.
LIST_START = re.compile(r"\n(?=[ \t]*(?:\d{1,2}(?:\.\d{1,2})*[.)]\s|\([a-zA-Z0-9]{1,3}\)\s|[-*•]\s|[A-Z][A-Z &]{3,}\n))")
SENTENCE_END = re.compile(r"[.!?;](?=[\"'”’)]?\s+[\"'“(]?[A-Z0-9])")
NUMBER_PREFIX = re.compile(r"^\s*(?:clause\s+)?(\d{1,2}(?:\.\d{1,2})*)[.)]\s", re.I)


def _is_abbreviation(text, dot_index):
    m = re.search(r"([A-Za-z.]+)$", text[:dot_index])
    if not m:
        # A dot after a digit, such as "5." in a numbered list, is not a sentence end.
        return dot_index > 0 and text[dot_index - 1].isdigit()
    word = m.group(1).lower().strip(".")
    return word in ABBREVIATIONS or len(word) == 1


def _heading_cuts(para):
    """Cut after short lines with no closing punctuation, such as '5. Training Bond'."""
    cuts, pos = [], 0
    for line in para.split("\n")[:-1]:
        pos += len(line) + 1
        stripped = line.strip()
        if stripped and stripped[-1] not in ".;:," and len(stripped.split()) <= 8:
            cuts.append(pos - 1)
    return cuts


def _blocks(text):
    for para in PARAGRAPH.finditer(text):
        start = para.start()
        cuts = sorted({m.start() for m in LIST_START.finditer(para.group())} | set(_heading_cuts(para.group())))
        bounds = [0] + cuts + [len(para.group())]
        for a, b in zip(bounds, bounds[1:]):
            yield start + a, start + b


def _sentences(text, start, end):
    chunk = text[start:end]
    last = 0
    for m in SENTENCE_END.finditer(chunk):
        if chunk[m.start()] == "." and _is_abbreviation(chunk, m.start()):
            continue
        yield start + last, start + m.end()
        last = m.end()
    yield start + last, end


def _trim(text, a, b):
    while a < b and text[a].isspace():
        a += 1
    while b > a and text[b - 1].isspace():
        b -= 1
    return a, b


def extract(text):
    """Return a list of clauses: {id, text, start, end, section}."""
    clauses = []
    section = None
    for block_start, block_end in _blocks(text):
        for a, b in _sentences(text, block_start, block_end):
            a, b = _trim(text, a, b)
            if a >= b:
                continue
            piece = text[a:b]
            num = NUMBER_PREFIX.match(piece)
            if num:
                section = num.group(1)
            # Headings and fragments ("7. Compensation") carry no obligation.
            if len(re.findall(r"[A-Za-z]{2,}", piece)) < 4:
                continue
            clauses.append({
                "id": len(clauses) + 1,
                "text": piece,
                "start": a,
                "end": b,
                "section": section,
            })
    return clauses
