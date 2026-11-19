"""Write docs/RULES.md from engine/rules/rules.json, so the rule list in the docs can't drift.

    python tools/make_rules_doc.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = {"HIGH": 0.7, "MEDIUM": 0.4}
DOC_TYPES = {"all": "all", "offer_letter": "offer letters", "quotation": "quotations", "ticket": "tickets", "policy": "online policies"}


def level(weight):
    return "HIGH" if weight >= LEVELS["HIGH"] else "MEDIUM" if weight >= LEVELS["MEDIUM"] else "LOW"


def main():
    rules = json.loads((ROOT / "engine" / "rules" / "rules.json").read_text(encoding="utf-8"))
    prots = {p["id"]: p for p in rules["protections"]}
    lines = [
        "# Rule reference",
        "",
        "Generated from `engine/rules/rules.json` by `python tools/make_rules_doc.py`. Do not edit by hand.",
        "",
        f"LEXGUARD checks **{len(rules['risks'])} kinds of risk** and **{len(rules['protections'])} kinds of protection**. "
        "The level shown is a rule's starting level. The Defender can lower it when it finds a matching protection, "
        "and removes it when the sentence turns out to be the reader's own right or a promise to the reader. "
        "**IN** marks a rule written for Indian law.",
        "",
        "## Risks",
        "",
        "| # | Risk | Starts at | Applies to | Lowered by | What it means |",
        "|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(rules["risks"], 1):
        types = ", ".join(DOC_TYPES.get(t, t) for t in r.get("doc_types", ["all"]))
        if "all" in r.get("doc_types", ["all"]):
            types = "all"
        lowered = ", ".join(prots[p]["name"].lower() for p in r.get("protections", [])) or "—"
        name = r["name"] + (" (IN)" if r.get("jurisdiction") == "IN" else "")
        reason = r["reason"].split(". ")[0].rstrip(".")
        lines.append(f"| {i} | {name} | {level(r['weight'])} | {types} | {lowered} | {reason} |")
    lines += [
        "",
        "## Protections",
        "",
        "| Protection | Lowers the weight by |",
        "|---|---|",
    ]
    for p in rules["protections"]:
        lines.append(f"| {p['name']} | {p['reduces']} |")
    lines += [
        "",
        "## Adding or changing a rule",
        "",
        "See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-or-changing-a-rule).",
        "",
    ]
    out = ROOT / "docs" / "RULES.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", out.relative_to(ROOT), f"({len(rules['risks'])} risks, {len(rules['protections'])} protections)")


if __name__ == "__main__":
    main()
