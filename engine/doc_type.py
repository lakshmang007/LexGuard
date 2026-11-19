"""Detect the document type so the matching rule pack is used."""
import re

SIGNALS = {
    "offer_letter": [
        "offer letter", "offer of employment", "date of joining", "joining", "ctc",
        "designation", "probation", "notice period", "employee", "salary",
        "appointment", "human resources", "hr ",
    ],
    "quotation": [
        "quotation", "quote", "estimate", "invoice", "scope of work", "deliverables",
        "advance", "client", "gst", "payment terms", "proposal", "milestone",
    ],
    "ticket": [
        "ticket", "event", "venue", "admission", "booking", "attendee", "entry",
        "concert", "show", "seat", "organiser", "organizer", "box office",
    ],
    "policy": [
        "terms of service", "terms of use", "privacy policy", "subscription",
        "account", "user", "website", "app", "cookies", "personal data", "platform",
    ],
}

LABELS = {
    "offer_letter": "Offer letter",
    "quotation": "Quotation / service agreement",
    "ticket": "Ticket terms",
    "policy": "Online policy / subscription",
}


def detect(text):
    lower = text.lower()
    scores = {
        t: sum(len(re.findall(r"\b" + re.escape(k.strip()) + r"\b", lower)) for k in kws)
        for t, kws in SIGNALS.items()
    }
    best = max(scores, key=scores.get)
    total = sum(scores.values()) or 1
    if scores[best] == 0:
        best = "policy"
    return {
        "type": best,
        "label": LABELS[best],
        "confidence": round(scores[best] / total, 2),
        "scores": scores,
    }
