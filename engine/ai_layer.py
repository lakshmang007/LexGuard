"""Optional AI layer (off by default).

The rule core runs fully offline. If an AI model is configured, this layer
may add flags for clauses no rule matched; every such flag is tagged
source="ai" so the report can disclose it. In this prototype the layer is
a stub: it reports itself as unavailable and changes nothing.
"""
import os


def available():
    return bool(os.environ.get("LEXGUARD_AI_ENDPOINT"))


def enhance(text, clauses, flags):
    if not available():
        return flags, {"used": False, "note": "AI layer not configured; results come from the offline rule library only."}
    # Hook point: send unflagged clauses to a local model and append
    # {"source": "ai", ...} flags. Not implemented in the prototype.
    return flags, {"used": False, "note": "AI endpoint set, but the AI layer is not implemented in this prototype."}
