"""LEXGUARD engine: Extractor -> Risk Finder -> Defender -> Judge."""
import json
import re
import time
from pathlib import Path

from . import ai_layer
from .defender import defend
from .doc_type import LABELS, detect
from .extractor import extract
from .impact import check_impact
from .judge import judge
from .risk_finder import applies, compile_rules, find_risks

RULES_PATH = Path(__file__).parent / "rules" / "rules.json"
_rules = None


def load_rules():
    global _rules
    if _rules is None:
        _rules = compile_rules(json.loads(RULES_PATH.read_text(encoding="utf-8")))
    return _rules


def clean(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    # Join lines broken in the middle of a sentence (common in PDF text).
    text = re.sub(r"(?<=[a-z,])\n(?=[a-z])", " ", text)
    return text


def analyze(text, doc_type=None, use_ai=False):
    t0 = time.perf_counter()
    rules = load_rules()
    text = clean(text)
    detected = detect(text)
    if doc_type in LABELS:
        detected = {**detected, "type": doc_type, "label": LABELS[doc_type], "confidence": 1.0}
    elif doc_type == "any":  # evaluation mode: apply every rule pack
        detected = {**detected, "type": "any", "label": "All rule packs", "confidence": 1.0}

    clauses = extract(text)
    find_risks(clauses, rules, detected["type"])
    defend(clauses, rules)
    check_impact(clauses)
    flags, overall = judge(clauses, rules)

    ai_info = {"used": False, "note": "AI layer switched off; results come from the offline rule library only."}
    if use_ai:
        flags, ai_info = ai_layer.enhance(text, clauses, flags)

    return {
        "text": text,
        "doc_type": detected,
        "clause_count": len(clauses),
        "rules_checked": sum(1 for r in rules["risks"] if applies(r, detected["type"])),
        "overall": overall,
        "flags": flags,
        "ai_layer": ai_info,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
        "disclaimer": "LEXGUARD is a review aid, not legal advice.",
    }
