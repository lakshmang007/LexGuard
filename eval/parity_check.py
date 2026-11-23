"""Check that the extension's JavaScript engine gives the same results as the Python engine.

Run from the lexguard folder:  python -m eval.parity_check     (needs Node.js)
"""
import ast
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine import analyze  # noqa: E402

# Non-English text must be refused the same way by both engines; a short Hindi
# phrase inside an English sentence must not be.
LANGUAGE_CASES = [
    ("hindi", "यह नौकरी का प्रस्ताव पत्र है। कंपनी अपने विवेक से वेतन बदल सकती है।",
     {"supported": False, "script": "Devanagari"}),
    ("kannada", "ಇದು ಉದ್ಯೋಗದ ಪ್ರಸ್ತಾವ ಪತ್ರ. ಕಂಪನಿಯು ತನ್ನ ವಿವೇಚನೆಯಿಂದ ಸಂಬಳವನ್ನು ಬದಲಾಯಿಸಬಹುದು.",
     {"supported": False, "script": "Kannada"}),
    ("english+hindi", "The Company may revise your salary at its sole discretion without notice (वेतन में बदलाव).",
     {"supported": True, "script": "Latin"}),
]


def cases():
    for f in sorted((ROOT / "samples").glob("*.txt")):
        yield {"text": f.read_text(encoding="utf-8"), "doc_type": None, "name": f.name}
    for f in sorted((ROOT / "web" / "_tmp").glob("*.txt")):  # real terms pages, when downloaded locally
        yield {"text": f.read_text(encoding="utf-8"), "doc_type": None, "name": f.name}
    yield {"text": (ROOT / "web" / "demo_signup.html").read_text(encoding="utf-8"), "doc_type": None, "name": "demo_signup.html"}
    for name, text, expect in LANGUAGE_CASES:
        yield {"text": text, "doc_type": None, "name": name, "expect": expect}
    for line in (ROOT / "datasets" / "lexglue_unfair_tos" / "test.jsonl").open(encoding="utf-8"):
        yield {"text": json.loads(line)["text"], "doc_type": "any", "name": "unfair_tos"}
    csv.field_size_limit(10**8)
    for row in csv.DictReader((ROOT / "datasets" / "cuad" / "master_clauses.csv").open(encoding="utf-8")):
        for col in ("Cap On Liability", "Non-Compete", "Renewal Term", "Termination For Convenience"):
            for snip in ast.literal_eval(row[col] or "[]"):
                yield {"text": snip, "doc_type": "any", "name": "cuad"}


def py_result(c):
    r = analyze(c["text"], c["doc_type"])
    lang = r["language"]
    return {
        "doc_type": r["doc_type"]["type"],
        "language": {"supported": lang["supported"], "script": lang["script"], "latin_share": lang["latin_share"]},
        "score": r["overall"]["score"],
        "skipped": r["overall"]["skipped"],
        "impact": [f["impact"] for f in r["flags"]],
        "breakdown": [[k["rule"], k["level"], k["points"], k["sentences"], k["defended"]] for k in r["overall"]["breakdown"]],
        "flags": [[f["start"], f["end"], f["rule"], f["level"], f["weight"], f["defender"], [a["rule"] for a in f["also"]]] for f in r["flags"]],
    }


def main():
    all_cases = list(cases())
    with tempfile.TemporaryDirectory() as tmp:
        cpath, opath = Path(tmp) / "cases.json", Path(tmp) / "out.json"
        cpath.write_text(json.dumps(all_cases), encoding="utf-8")
        subprocess.run(["node", str(ROOT / "eval" / "parity_run.js"), str(cpath), str(opath)], check=True)
        js = json.loads(opath.read_text(encoding="utf-8"))
    mismatches = 0
    for c, j in zip(all_cases, js):
        p = py_result(c)
        if p != j:
            mismatches += 1
            if mismatches <= 5:
                print(f"MISMATCH in {c['name']}: {c['text'][:100]!r}\n  py: {p}\n  js: {j}")
        # Both engines agreeing is not enough for the language cases: they must also be right.
        wrong = {k: p["language"][k] for k, v in c.get("expect", {}).items() if p["language"][k] != v}
        if wrong:
            mismatches += 1
            print(f"WRONG LANGUAGE in {c['name']}: expected {c['expect']}, got {wrong}")
    flags = sum(len(py_result(c)["flags"]) for c in all_cases[:5])
    print(f"{len(all_cases)} documents/sentences compared, {mismatches} mismatches ({flags} flags in the sample documents).")
    return mismatches == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
