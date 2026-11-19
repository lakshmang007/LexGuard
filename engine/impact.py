"""Defender, part 2 - who does this sentence affect?

A risky word is only a risk for the reader if the reader carries the cost.
This step looks at who acts in the sentence:

- "you may cancel / you can opt out / you may reject the change"  -> your right, not a risk
- "we will not sell / we do not delete / we never share"            -> a promise to you, not a risk
- "you will not be liable"                                          -> protects you, not a risk
- "either party may terminate"                                      -> applies to both sides, lowered
- "we may change", "you may be charged", "we will not be liable"    -> a risk for you, kept

Sentences that turn out not to be a risk for the reader are removed from the
report and listed separately, so the reader can still see what was skipped.
"""
import re

USER = r"you|yourself|the user|the employee|the client|the merchant|the subscriber|the attendee|the buyer|the member|the candidate"
COMPANY = r"we|us|the company|the provider|the service provider|the platform|the organi[sz]er|the employer|the vendor|the licensor"
MUTUAL = r"either party|each party|both parties|the parties|either of the parties|mutually"
PARTY = re.compile(rf"\b(?:(?P<mutual>{MUTUAL})|(?P<user>{USER})|(?P<company>{COMPANY}))\b", re.I)

# A right the reader holds: "you may / can / are free to ...", but not "you may be charged".
USER_RIGHT = re.compile(r"[\s,]*(?:\w+[\s,]+){0,2}?(?:may|can|could|are (?:free|entitled|allowed) to|have the right to|shall have the right to|choose to|opt)\b(?![\s,]+(?:also[\s,]+|still[\s,]+)?be\b)", re.I)
# A promise the company makes to the reader: "we will not sell / do not delete ...".
PROMISE = re.compile(rf"\b(?:{COMPANY})\b[^.;]{{0,30}}?\b(?:(?:will|shall|do|does|would|can|may)(?:\s+not|n['’]t)|never|no longer)\b[^.;]{{0,40}}?\b(?:sell|rent|share|disclose|delete|remove|screen|monitor|charge|increase|change|modify|renew|transfer|terminate|suspend|use)\w*\b", re.I)
EXCEPTION = re.compile(r"\b(?:except|unless|other than|however|but)\b", re.I)
# "you will not be liable": the reader, not the company, is the one protected.
YOU_NOT_LIABLE = re.compile(r"\byou\s+(?:will|shall|would|are)\s+not\s+be\s+(?:held\s+)?(?:liable|responsible)\b", re.I)

# Rules where the risk is a power the other side holds (to change, end, remove, share, charge).
POWER_RULES = {
    "unilateral_change", "termination_without_notice", "termination_for_convenience", "content_removal",
    "provider_cancellation", "data_sharing", "price_escalation", "hidden_fees", "auto_renewal",
    "pay_change", "transfer_anywhere",
}
# Rules a company promise ("we will not ...") can cancel out.
PROMISE_RULES = {
    "data_sharing", "content_removal", "hidden_fees", "auto_renewal", "unilateral_change",
    "price_escalation", "termination_without_notice", "termination_for_convenience",
}
# Rules where "you will not be liable" means the clause protects the reader.
LIABILITY_RULES = {"limitation_of_liability", "delay_no_liability"}
MUTUAL_REDUCES = 0.2


def actor_before(text, pos):
    """The last party named before position `pos`: ('user' | 'company' | 'mutual', match) or (None, None)."""
    last = None
    for m in PARTY.finditer(text, 0, pos):
        last = m
    if not last:
        return None, None
    return last.lastgroup, last


def assess(text, rule_id, match_start, match_text):
    """Return (impact, note): impact is 'you', 'both' or 'not_you'."""
    if rule_id in PROMISE_RULES:
        for p in PROMISE.finditer(text):
            if p.start() <= match_start <= p.end() + 80 and not EXCEPTION.search(text, p.start(), max(p.end(), match_start)):
                return "not_you", "A promise the company makes to you, not a risk for you."
    kind, actor = actor_before(text, match_start + 1)
    if kind == "user" and rule_id in POWER_RULES and USER_RIGHT.match(text, actor.end()):
        return "not_you", "This is something you can choose to do, not something done to you."
    if rule_id in LIABILITY_RULES:
        for m in YOU_NOT_LIABLE.finditer(text):
            if m.start() <= match_start <= m.end():
                return "not_you", "This limits your liability, which protects you."
    # "Either party may ..." only counts when both parties are the ones acting, not "the parties agree that X may ...".
    between = text[actor.end():match_start] if actor else ""
    if (kind == "mutual" and rule_id in POWER_RULES | {"limitation_of_liability", "exit_fee"}
            and len(between) <= 25 and not re.search(r"\b(?:that|which|whereby)\b", between, re.I)):
        return "both", "Applies to both sides, so it is fairer."
    return "you", ""


def check_impact(clauses):
    """Drop risks that do not fall on the reader; lower the ones that apply to both sides."""
    for clause in clauses:
        kept, skipped = [], []
        for hit in clause.get("risks", []):
            start = clause["text"].find(hit["matched"])
            impact, note = assess(clause["text"], hit["rule"], max(start, 0), hit["matched"])
            hit["impact"] = impact
            if impact == "not_you":
                skipped.append({"rule": hit["rule"], "name": hit["name"], "reason": note})
                continue
            if impact == "both":
                hit["final_weight"] = round(max(0.05, hit["final_weight"] - MUTUAL_REDUCES), 2)
                hit["defender_note"] += " " + note
            kept.append(hit)
        clause["risks"] = kept
        clause["skipped"] = skipped
    return clauses
