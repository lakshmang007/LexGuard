"""Agent 3 - Defender: look across the whole document for protections.

A protection only counts if it sits in the same clause as the risk, or in a
clause about the same topic (for rules that declare one). This stops a
generic "30 days' written notice" for resignation from cancelling a risk
about pay changes.
"""


def label(clause):
    """Human label that matches the document's own numbering where possible."""
    return f"clause {clause['section']}" if clause.get("section") else f"sentence {clause['id']}"


def _find_protection(prot, clause, clauses, topic_re):
    for rx in prot["_re"]:
        if m := rx.search(clause["text"]):
            return clause, m.group(0)
    for other in clauses:
        if other is clause:
            continue
        if topic_re and not topic_re.search(other["text"]):
            continue
        for rx in prot["_re"]:
            if m := rx.search(other["text"]):
                return other, m.group(0)
    return None


def defend(clauses, rules):
    risks_by_id = {r["id"]: r for r in rules["risks"]}
    prots_by_id = {p["id"]: p for p in rules["protections"]}
    for clause in clauses:
        for hit in clause.get("risks", []):
            rule = risks_by_id[hit["rule"]]
            hit["defended_by"] = []
            looked_for = []
            weight = hit["weight"]
            for pid in rule.get("protections", []):
                prot = prots_by_id[pid]
                looked_for.append(prot["name"].lower())
                found = _find_protection(prot, clause, clauses, rule["_topic"])
                if found:
                    where, text = found
                    weight -= prot["reduces"]
                    hit["defended_by"].append({
                        "protection": pid,
                        "name": prot["name"],
                        "clause_id": where["id"],
                        "clause_label": label(where),
                        "matched": text,
                    })
            hit["final_weight"] = round(max(0.05, weight), 2)
            if hit["defended_by"]:
                parts = [f"{d['name']} found in {d['clause_label']} (\"{d['matched']}\")" for d in hit["defended_by"]]
                hit["defender_note"] = "Risk reduced: " + "; ".join(parts) + "."
            elif looked_for:
                hit["defender_note"] = "No protection found elsewhere (looked for: " + ", ".join(looked_for) + "), so the risk stays."
            else:
                hit["defender_note"] = "No standard protection exists for this risk; check it carefully."
    return clauses
