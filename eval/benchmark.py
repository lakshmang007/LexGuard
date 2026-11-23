"""Measure LEXGUARD against the prototype targets on the synthetic samples.

Run from the lexguard folder:  python -m eval.benchmark
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine import analyze  # noqa: E402

TARGETS = {
    "recall": 0.80,          # planted risky clauses flagged: at least 80%
    "false_high": 0.20,      # clean clauses wrongly flagged HIGH: at most 20%
    "quoted": 1.00,          # flags that quote their exact source sentence: 100%
    "time_ms": 10_000,       # processing time for a 2-page document: under 10 s
}

# Non-English documents must be refused instead of getting a false "LOW risk".
NON_ENGLISH = {
    "Devanagari": "यह नौकरी का प्रस्ताव पत्र है। कंपनी अपने विवेक से वेतन बदल सकती है। "
                  "कर्मचारी को तीन महीने की नोटिस अवधि देनी होगी।",
    "Kannada": "ಇದು ಉದ್ಯೋಗದ ಪ್ರಸ್ತಾವ ಪತ್ರ. ಕಂಪನಿಯು ತನ್ನ ವಿವೇಚನೆಯಿಂದ ಸಂಬಳವನ್ನು ಬದಲಾಯಿಸಬಹುದು. "
               "ನೌಕರನು ಮೂರು ತಿಂಗಳ ನೋಟಿಸ್ ನೀಡಬೇಕು.",
}


def check_languages():
    """Non-English samples refused with the right script; every English sample still checked."""
    print("\n== Language check")
    refused = 0
    for script, text in NON_ENGLISH.items():
        lang = analyze(text)["language"]
        ok = not lang["supported"] and lang["script"] == script
        refused += ok
        print(f"   {'ok  ' if ok else 'FAIL'} {script:<11} -> supported {lang['supported']}, script {lang['script']}")
    english = sorted((ROOT / "samples").glob("*.txt"))
    kept = 0
    for f in english:
        lang = analyze(f.read_text(encoding="utf-8"))["language"]
        kept += lang["supported"]
        print(f"   {'ok  ' if lang['supported'] else 'FAIL'} {f.name:<22} -> supported {lang['supported']}, "
              f"Latin share {lang['latin_share']:.0%}")
    return refused, kept, len(english)


def run():
    labels = json.loads((ROOT / "samples" / "labels.json").read_text(encoding="utf-8"))
    total_planted = total_found = total_clean = total_false_high = 0
    total_flags = total_quoted = 0
    worst_ms = 0.0
    type_ok = 0
    docs = [k for k in labels if not k.startswith("_")]

    for name in docs:
        spec = labels[name]
        text = (ROOT / "samples" / name).read_text(encoding="utf-8")
        result = analyze(text)
        worst_ms = max(worst_ms, result["elapsed_ms"])
        type_ok += result["doc_type"]["type"] == spec["doc_type"]
        flags = result["flags"]
        clean_text = result["text"]

        missed = [p for p in spec["planted"] if not any(p.lower() in f["text"].lower() for f in flags)]
        found = len(spec["planted"]) - len(missed)

        # Clean clauses = flagged clauses that contain no planted substring, plus unflagged ones.
        false_high = [f for f in flags if f["level"] == "HIGH"
                      and not any(p.lower() in f["text"].lower() for p in spec["planted"])]
        clean_count = result["clause_count"] - found

        quoted = sum(1 for f in flags if clean_text[f["start"]:f["end"]] == f["text"])

        total_planted += len(spec["planted"])
        total_found += found
        total_clean += clean_count
        total_false_high += len(false_high)
        total_flags += len(flags)
        total_quoted += quoted

        print(f"\n== {name}  (detected: {result['doc_type']['label']}, expected: {spec['doc_type']})")
        print(f"   clauses {result['clause_count']}, flags {len(flags)}, "
              f"score {result['overall']['score']} ({result['overall']['level']}), {result['elapsed_ms']} ms")
        for f in flags:
            mark = "*" if any(p.lower() in f["text"].lower() for p in spec["planted"]) else " "
            d = " [defended]" if f["defended"] else ""
            print(f"   {mark} {f['level']:<6} {f['rule']:<26} {f['text'][:70]}{d}")
        for m in missed:
            print(f"   MISSED: {m}")
        for f in false_high:
            print(f"   FALSE HIGH: {f['text'][:80]}")

    recall = total_found / total_planted
    false_high = total_false_high / max(1, total_clean)
    quoted = total_quoted / max(1, total_flags)
    refused, kept, english = check_languages()
    rows = [
        ("Planted risky clauses flagged", f"{recall:.0%}", ">= 80%", recall >= TARGETS["recall"]),
        ("Clean clauses wrongly flagged HIGH", f"{false_high:.0%}", "<= 20%", false_high <= TARGETS["false_high"]),
        ("Flags that quote their source sentence", f"{quoted:.0%}", "100%", quoted >= TARGETS["quoted"]),
        ("Slowest document processing time", f"{worst_ms:.0f} ms", "< 10 s", worst_ms < TARGETS["time_ms"]),
        ("Document type detected correctly", f"{type_ok}/{len(docs)}", "all", type_ok == len(docs)),
        ("Non-English documents refused", f"{refused}/{len(NON_ENGLISH)}", f"all, {kept}/{english} English kept",
         refused == len(NON_ENGLISH) and kept == english),
    ]
    print("\n== Results vs targets")
    for label, got, goal, ok in rows:
        print(f"   {'PASS' if ok else 'FAIL'}  {label:<40} {got:>8}   target {goal}")
    return all(r[3] for r in rows)


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
