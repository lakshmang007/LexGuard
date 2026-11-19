"""Agent 2 - Risk Finder: match each clause against the risky-pattern library."""
import re


def applies(rule, doc_type):
    types = rule.get("doc_types", ["all"])
    return doc_type == "any" or "all" in types or doc_type in types


def compile_rules(rules):
    for r in rules["risks"]:
        r["_re"] = [re.compile(p, re.I) for p in r["patterns"]]
        r["_boost"] = [re.compile(p, re.I) for p in r.get("boost_patterns", [])]
        r["_exclude"] = [re.compile(p, re.I) for p in r.get("exclude_patterns", [])]
        r["_topic"] = re.compile(r["topic"], re.I) if r.get("topic") else None
    for p in rules["protections"]:
        p["_re"] = [re.compile(x, re.I) for x in p["patterns"]]
    return rules


def find_risks(clauses, rules, doc_type):
    """Attach a list of matched risks to each clause (highest weight first)."""
    active = [r for r in rules["risks"] if applies(r, doc_type)]
    for clause in clauses:
        hits = []
        for rule in active:
            match = next((m for rx in rule["_re"] if (m := rx.search(clause["text"]))), None)
            # Exclusions catch rights that belong to the reader ("you may cancel at any time").
            if not match or any(x.search(clause["text"]) for x in rule["_exclude"]):
                continue
            weight = rule["weight"]
            if any(b.search(clause["text"]) for b in rule["_boost"]):
                weight = min(1.0, weight + 0.1)
            hits.append({
                "rule": rule["id"],
                "name": rule["name"],
                "weight": round(weight, 2),
                "matched": match.group(0),
                "jurisdiction": rule.get("jurisdiction"),
            })
        # A more specific rule (e.g. pay_change) makes the generic one redundant.
        if any(h["rule"] == "pay_change" for h in hits):
            hits = [h for h in hits if h["rule"] != "unilateral_change"]
        clause["risks"] = sorted(hits, key=lambda h: -h["weight"])
    return clauses
