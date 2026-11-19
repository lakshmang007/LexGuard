"""Evaluate LEXGUARD on free public datasets (both CC BY 4.0).

1. LexGLUE UNFAIR-ToS: 9,414 sentences from 50 online Terms of Service, each
   labelled with 0+ of 8 unfair-clause types (Lippi et al., 2019).
2. CUAD v1 master_clauses.csv: expert-annotated clauses from 510 commercial
   contracts (The Atticus Project, 2021). Positive examples only.

Run from the lexguard folder:  python -m eval.public_datasets [--split test]
Writes eval/results_public.json and eval/results_public.md.
"""
import argparse
import ast
import csv
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine import analyze  # noqa: E402

DATA = ROOT / "datasets"

# UNFAIR-ToS label -> LEXGUARD rules that cover it (empty = no rule yet: a known gap).
UNFAIR_MAP = {
    "Limitation of liability": {"limitation_of_liability", "waiver_of_claims", "delay_no_liability"},
    "Unilateral termination": {"termination_without_notice", "termination_for_convenience"},
    "Unilateral change": {"unilateral_change", "price_escalation", "pay_change"},
    "Content removal": {"content_removal"},
    "Contract by using": {"contract_by_using"},
    "Choice of law": {"choice_of_law"},
    "Jurisdiction": {"exclusive_jurisdiction"},
    "Arbitration": {"mandatory_arbitration"},
}

# CUAD category -> LEXGUARD rules that cover it.
CUAD_MAP = {
    "Renewal Term": {"auto_renewal"},
    "Non-Compete": {"non_compete"},
    "Cap On Liability": {"limitation_of_liability", "waiver_of_claims"},
    "Liquidated Damages": {"service_bond", "exit_fee"},
    "Covenant Not To Sue": {"waiver_of_claims", "no_challenge"},
    "Termination For Convenience": {"termination_without_notice", "termination_for_convenience"},
    "Ip Ownership Assignment": {"ip_overreach", "ip_assignment"},
}


def rules_hit(text):
    r = analyze(text, doc_type="any")
    rules = set()
    for f in r["flags"]:
        rules.add(f["rule"])
        rules.update(a["rule"] for a in f["also"])
    levels = {f["level"] for f in r["flags"]}
    return rules, levels


def load_unfair(split):
    path = DATA / "lexglue_unfair_tos" / f"{split}.jsonl"
    names = json.loads((DATA / "lexglue_unfair_tos" / "meta.json").read_text())["labels"]
    rows = [json.loads(line) for line in path.open(encoding="utf-8")]
    assert all(lab in names for r in rows for lab in r["labels"])
    return [(r["text"], r["labels"]) for r in rows]


def eval_unfair(split):
    rows = load_unfair(split)
    tp = fp = fn = tn = 0
    fair_high = 0
    per_label = defaultdict(lambda: {"total": 0, "any_flag": 0, "right_rule": 0})
    fp_rules = Counter()
    misses = defaultdict(list)
    t0 = time.perf_counter()
    for text, labels in rows:
        rules, levels = rules_hit(text)
        flagged = bool(rules)
        if labels:
            tp += flagged
            fn += not flagged
            for lab in labels:
                s = per_label[lab]
                s["total"] += 1
                s["any_flag"] += flagged
                ok = bool(rules & UNFAIR_MAP[lab])
                s["right_rule"] += ok
                if not ok and len(misses[lab]) < 5:
                    misses[lab].append(text[:200])
        else:
            fp += flagged
            tn += not flagged
            fair_high += "HIGH" in levels
            fp_rules.update(rules)
    secs = time.perf_counter() - t0
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    return {
        "dataset": "LexGLUE UNFAIR-ToS",
        "split": split,
        "sentences": len(rows),
        "unfair_sentences": tp + fn,
        "fair_sentences": fp + tn,
        "binary": {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(2 * precision * recall / max(1e-9, precision + recall), 3),
            "fair_flagged_any": round(fp / max(1, fp + tn), 3),
            "fair_flagged_high": round(fair_high / max(1, fp + tn), 3),
        },
        "per_label": {k: {**v, "recall_right_rule": round(v["right_rule"] / max(1, v["total"]), 3)}
                      for k, v in sorted(per_label.items())},
        "top_false_positive_rules": fp_rules.most_common(8),
        "sample_misses": dict(misses),
        "seconds": round(secs, 2),
        "ms_per_sentence": round(1000 * secs / max(1, len(rows)), 2),
    }


def cuad_rows(part):
    """Contracts alternate between halves: even rows tune the rules, odd rows are held out."""
    csv.field_size_limit(10**8)
    reader = csv.DictReader((DATA / "cuad" / "master_clauses.csv").open(encoding="utf-8"))
    for i, row in enumerate(reader):
        if part == "all" or (part == "tune") == (i % 2 == 0):
            yield row


def eval_cuad(part="holdout"):
    per_cat = {c: {"clauses": 0, "any_flag": 0, "right_rule": 0} for c in CUAD_MAP}
    misses = defaultdict(list)
    contracts = 0
    for row in cuad_rows(part):
        contracts += 1
        for cat, expected in CUAD_MAP.items():
            try:
                snippets = ast.literal_eval(row[cat] or "[]")
            except (ValueError, SyntaxError):
                continue
            for snip in snippets:
                if len(snip.split()) < 4:
                    continue
                rules, _ = rules_hit(snip)
                s = per_cat[cat]
                s["clauses"] += 1
                s["any_flag"] += bool(rules)
                ok = bool(rules & expected)
                s["right_rule"] += ok
                if not ok and len(misses[cat]) < 5:
                    misses[cat].append(snip[:200])
    for s in per_cat.values():
        s["recall_right_rule"] = round(s["right_rule"] / max(1, s["clauses"]), 3)
        s["recall_any_flag"] = round(s["any_flag"] / max(1, s["clauses"]), 3)
    total = sum(s["clauses"] for s in per_cat.values())
    right = sum(s["right_rule"] for s in per_cat.values())
    return {
        "dataset": "CUAD v1 (master_clauses.csv)",
        "part": part,
        "contracts": contracts,
        "clauses_tested": total,
        "recall_right_rule": round(right / max(1, total), 3),
        "per_category": per_cat,
        "sample_misses": dict(misses),
    }


def to_markdown(u, c):
    b = u["binary"]
    lines = [
        "# LEXGUARD on public datasets",
        "",
        f"## LexGLUE UNFAIR-ToS ({u['split']} split, {u['sentences']} sentences)",
        "",
        "| Metric | Value |", "|---|---|",
        f"| Unfair sentences flagged (recall) | {b['recall']:.1%} |",
        f"| Flags that were really unfair (precision) | {b['precision']:.1%} |",
        f"| F1 | {b['f1']:.3f} |",
        f"| Fair sentences flagged at any level | {b['fair_flagged_any']:.1%} |",
        f"| Fair sentences flagged HIGH | {b['fair_flagged_high']:.1%} |",
        f"| Speed | {u['ms_per_sentence']} ms per sentence |",
        "",
        "| Unfair type | Sentences | Caught by the matching rule |", "|---|---|---|",
    ]
    lines += [f"| {k} | {v['total']} | {v['recall_right_rule']:.0%} |" for k, v in u["per_label"].items()]
    lines += [
        "",
        f"## CUAD v1 ({c['part']} half: {c['contracts']} contracts, {c['clauses_tested']} annotated clauses)",
        "",
        "| CUAD category | Clauses | Caught by the matching rule | Flagged by any rule |", "|---|---|---|---|",
    ]
    lines += [f"| {k} | {v['clauses']} | {v['recall_right_rule']:.0%} | {v['recall_any_flag']:.0%} |" for k, v in c["per_category"].items()]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="test", choices=["train", "validation", "test"])
    ap.add_argument("--cuad", default=None, choices=["tune", "holdout", "all"],
                    help="CUAD half to use (default: holdout for the test split, tune otherwise)")
    args = ap.parse_args()
    u = eval_unfair(args.split)
    c = eval_cuad(args.cuad or ("holdout" if args.split == "test" else "tune"))
    (ROOT / "eval" / "results_public.json").write_text(json.dumps({"unfair_tos": u, "cuad": c}, indent=2, ensure_ascii=False), encoding="utf-8")
    md = to_markdown(u, c)
    (ROOT / "eval" / "results_public.md").write_text(md, encoding="utf-8")
    print(md)
    print("Top rules firing on fair sentences:", u["top_false_positive_rules"])


if __name__ == "__main__":
    main()
