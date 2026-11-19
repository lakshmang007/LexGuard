"""Agent 4 - Judge: final level per clause, overall score and top questions."""
from .defender import label

# Risk score: every *kind* of risk counts once, however many sentences repeat it, so a
# long document is not punished for its length. Points per kind follow its worst sentence.
LEVEL_POINTS = {"HIGH": 15, "MEDIUM": 5, "LOW": 1}
SCORE_LEVELS = {"HIGH": 50, "MEDIUM": 20}  # overall level from the score
ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


def _level(weight, thresholds):
    if weight >= thresholds["HIGH"]:
        return "HIGH"
    if weight >= thresholds["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def judge(clauses, rules):
    risks_by_id = {r["id"]: r for r in rules["risks"]}
    thresholds = rules["levels"]
    flags = []
    for clause in clauses:
        hits = clause.get("risks", [])
        if not hits:
            continue
        hits.sort(key=lambda h: -h["final_weight"])
        top = hits[0]
        # Several independent risks in one clause push it up a little.
        weight = min(1.0, top["final_weight"] + 0.05 * (len(hits) - 1))
        rule = risks_by_id[top["rule"]]
        flags.append({
            "id": clause["id"],
            "section": clause["section"],
            "label": label(clause).capitalize(),
            "text": clause["text"],
            "start": clause["start"],
            "end": clause["end"],
            "level": _level(weight, thresholds),
            "weight": round(weight, 2),
            "rule": top["rule"],
            "risk_name": top["name"],
            "matched": top["matched"],
            "reason": rule["reason"],
            "defender": top["defender_note"],
            "defended": bool(top["defended_by"]),
            "question": rule["question"],
            "safer_wording": rule["safer_wording"],
            "jurisdiction": top.get("jurisdiction"),
            "also": [{"rule": h["rule"], "name": h["name"]} for h in hits[1:]],
            "impact": top["impact"],
            "source": "rules",
        })

    # Sentences the Defender found are not a risk for the reader (a right or a promise to them).
    skipped = [{"id": c["id"], "label": label(c).capitalize(), "text": c["text"], "name": c["skipped"][0]["name"],
                "reason": c["skipped"][0]["reason"]}
               for c in clauses if c.get("skipped") and not c.get("risks")]
    counts = {lvl: sum(1 for f in flags if f["level"] == lvl) for lvl in LEVEL_POINTS}

    kinds = {}
    for f in flags:
        k = kinds.setdefault(f["rule"], {"rule": f["rule"], "name": f["risk_name"], "level": f["level"],
                                         "sentences": 0, "defended": 0, "first_id": f["id"]})
        k["sentences"] += 1
        k["defended"] += f["defended"]
        if ORDER[f["level"]] < ORDER[k["level"]]:
            k["level"] = f["level"]
    breakdown = sorted(kinds.values(), key=lambda k: (ORDER[k["level"]], -k["sentences"]))
    for k in breakdown:
        k["points"] = LEVEL_POINTS[k["level"]]
    points = sum(k["points"] for k in breakdown)
    score = min(100, points)
    overall = "HIGH" if score >= SCORE_LEVELS["HIGH"] else "MEDIUM" if score >= SCORE_LEVELS["MEDIUM"] else "LOW"

    ranked = sorted(flags, key=lambda f: -f["weight"])
    top_questions, seen = [], set()
    for f in ranked:
        if f["question"] not in seen and f["level"] != "LOW":
            seen.add(f["question"])
            top_questions.append({"clause_id": f["id"], "label": f["label"], "question": f["question"]})
        if len(top_questions) == 3:
            break

    return flags, {
        "score": score,
        "level": overall,
        "counts": counts,
        "top_questions": top_questions,
        "breakdown": breakdown,
        "points": points,
        "kind_counts": {lvl: sum(1 for k in breakdown if k["level"] == lvl) for lvl in LEVEL_POINTS},
        "level_points": LEVEL_POINTS,
        "defended": sum(1 for f in flags if f["defended"]),
        "both_sides": sum(1 for f in flags if f["impact"] == "both"),
        "skipped": len(skipped),
        "skipped_examples": skipped[:5],
    }
