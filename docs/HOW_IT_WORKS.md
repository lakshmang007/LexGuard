# How LEXGUARD works

Three questions people ask first, answered from the code: how a PDF is read, what goes into the "prompt", and how the risk score is decided. File and function names are given so every answer can be checked.

**Short version:** LEXGUARD (version 0.7.0) does not use an AI model. It reads the text, splits it into sentences, matches each sentence against 32 written rules, lowers a risk when the same document also protects you, and adds up points per kind of risk. Every warning shows the exact sentence it came from.

## 1. How it reads a PDF

There are two ways in, and neither sends the file anywhere.

| Where | Code | What happens |
|---|---|---|
| Extension checker page (upload a `.pdf`) | `extension/checker.js`, `pdfText()` | Mozilla **pdf.js 3.11.174** (bundled in `extension/vendor/`) opens the file inside the browser. For each page it calls `getTextContent()` and joins the text pieces, keeping pdf.js's end-of-line marks (`hasEOL`) as line breaks. Pages are joined with a blank line. Scripted fonts are turned off (`isEvalSupported: false`) because of CVE-2024-4367. |
| Local web app (optional) | `server.py`, `POST /extract` | **pypdf** (`PdfReader(...).pages[i].extract_text()`), with the same blank line between pages. Bodies over 10 MB are refused. |
| A web page | `extension/sidepanel.js`, `readPageFn` | No PDF at all: the page's own visible text (`document.body.innerText`), or only the selected text. |

Then the text is cleaned (`engine/__init__.py`, `clean()`; `clean` in `engine.js`): line endings are made uniform, and a line break between two lower-case words is joined back into one line, because PDFs break sentences at the end of each printed line.

**Limits:** a scanned PDF has no text layer, so `pdfText()` returns nothing and the page says OCR isn't built yet. Chrome's own PDF viewer can't be read by extensions, which is why PDFs are uploaded in the checker page instead.

## 2. What goes into the "prompt"

**In this version, nothing: there is no prompt and no AI model.** The text goes into a fixed pipeline of four steps, the same in Python (`engine/`) and in the browser (`extension/engine.js`). A parity test (`python -m eval.parity_check`) checks the two give identical results on 2,895 documents and sentences.

| Step | Code | What it does |
|---|---|---|
| 1. Extractor | `extractor.py` | Splits the text into paragraphs, list items and sentences, knowing abbreviations like "Rs." and "Pvt.". Keeps each sentence's exact start and end position, so it can be highlighted later. |
| 2. Risk Finder | `risk_finder.py` | Tests every sentence against the **32 risk rules** in `engine/rules/rules.json` (case-insensitive regular expressions). Each rule has a starting **weight**, for example `non_refundable` = 0.7. Words like "without notice" add 0.1 (`boost_patterns`); the reader's own rights, such as "you may cancel", are excluded (`exclude_patterns`). |
| 3a. Defender | `defender.py` | For each hit, looks for its **protections** in the same sentence or in a sentence on the same topic. Each protection found lowers the weight by its own amount (for example "written notice" −0.4, "mutual consent" −0.55), never below 0.05. The card says what was found and where. |
| 3b. Who does it affect? | `impact.py` | Removes sentences that are your own right ("you can opt out"), a promise to you ("we do not sell your data") or "you will not be liable"; they are listed under *Not a risk for you*. Rules that bind both sides ("either party may…") are lowered by 0.2. |
| 4. Judge | `judge.py` | Sets each sentence's level and the overall score (next section). |

What a rule looks like (`engine/rules/rules.json`):

```json
{
  "id": "non_refundable",
  "name": "Non-refundable payment",
  "weight": 0.7,
  "patterns": ["\\bnon[- ]?refundable\\b", "\\bno refunds?\\b", "\\b(will|shall) not be refunded\\b", "\\bforfeit\\w*\\b"],
  "protections": ["refund_window", "provider_cancel_refund"],
  "reason": "You may lose your money even if you cancel early or the service changes.",
  "question": "Will I get a refund if the other side cancels or changes the service, or if I cancel early?",
  "safer_wording": "A full refund will be given if the Provider cancels or materially changes the service, ..."
}
```

The explanation, the question to ask and the fairer wording are written once per rule by people, not generated, so the same sentence always gets the same answer. The **Ask LEXGUARD** chat (`web/chat.js`) works the same way: it answers from the report, the rules and a 30-word glossary, with no AI service.

### The first version did use a prompt

The first LexGuard (built for the Google AI Studio Build program, still in this repository's git history before commit `8e3b192`) was a React + Express app. `server.ts` read the PDF with **pdf-parse** and sent the **whole document text** to **`gemini-1.5-flash`**, in a prompt that began *"You are a senior legal analyst specializing in contract risk management…"* and asked for JSON with `riskScore` (0–100), `executiveSummary`, `highRiskClauses` (`clause`, `plainEnglish`, `implication`), `missingProtections` and `negotiationRecommendations`.

Why it was rebuilt:

| | Version 1 (Gemini) | Version 0.7.0 (rules) |
|---|---|---|
| Where your document goes | Uploaded to a server, then to Google's API | Stays in your browser |
| Risk score | Whatever number the model returned | Computed by code, every point explained |
| Quoted clause | The model was asked for "exact text", but nothing checked it | Always the real sentence, cut from the document at its exact position |
| Same document twice | Could give different answers | Always the same answer |
| Needs | An API key and internet | Nothing; works offline |
| Measured accuracy | Not measured | 74.4% of unfair clauses caught on held-out public data, 3.0% of fair sentences wrongly marked HIGH |

## 3. How the risk score is decided

All in `engine/judge.py`.

1. **Each flagged sentence gets a level** from its final weight, after the Defender: **0.7 or more is HIGH**, **0.4 or more is MEDIUM**, anything lower is **LOW** (thresholds in `rules.json`, `"levels"`). If one sentence matches several rules, the strongest one leads and each extra rule adds 0.05.
2. **Each kind of risk counts once**, at the level of its worst sentence. Ten sentences about fees count as one "Extra or unclear fees", so a long document isn't punished for being long.
3. **Points per kind:** HIGH **15**, MEDIUM **5**, LOW **1**, with the total capped at **100**.
4. **Overall level:** 50 or more is HIGH risk, 20–49 MEDIUM, under 20 LOW.

Worked example, the demo signup page (`demo/5_StreamNest_Signup_Page.html`):

| Kind of risk | Sentence's weight | Level | Points |
|---|---|---|---|
| Termination without notice | 0.90 | HIGH | 15 |
| Terms can be changed one-sided | 0.80 | HIGH | 15 |
| One-sided indemnity | 0.75 | HIGH | 15 |
| Non-refundable payment | 0.70 | HIGH | 15 |
| Automatic renewal | 0.60 | MEDIUM | 5 |
| Your data is shared | 0.60 | MEDIUM | 5 |
| Extra or unclear fees | 0.55 | MEDIUM | 5 |
| Disputes only in their city | 0.35 | LOW | 1 |
| **Total** | | | **76, HIGH risk** |

The report shows this same table under **How was this score worked out?**

## 4. Why it can't make things up

- **The quoted sentence is real.** Every flag's `text` is a slice of the input at its recorded start and end positions. Nothing is generated, and the page highlight uses the same positions.
- **The quote sits next to the explanation.** Each risk card shows the document's own words first, then the plain-words explanation and the question to ask, so a reader can check every claim in place.
- **The explanations are fixed per rule** and reviewed in `docs/RULES.md`; the score is arithmetic you can redo by hand.

What it can still get wrong: it misses risks phrased in ways no rule expects (about a quarter of unfair website clauses), and it only checks English documents.

## Questions to expect

**"Is it AI?"** Not this version. It's a rule-based pipeline of four steps. The first version used Gemini; it was replaced so the document never leaves the browser and every result can be explained and repeated.

**"How do you know it works?"** On public datasets the rules were never tuned on: 74.4% of unfair clauses caught on LexGLUE UNFAIR-ToS (1,607 held-out sentences from 50 websites), 59% on CUAD contracts, and only 3.0% of fair sentences marked HIGH. Run `python -m eval.public_datasets --split test`.

**"What if the rules are wrong?"** Every warning shows the sentence, the rule that fired and what the Defender looked for. A wrong rule is one JSON entry to fix, and the tests in `tools/run_all_tests.py` show whether the fix broke anything.
