# LEXGUARD: AI Rights and Contract Intelligence System

**See the risky sentence before you sign.** LEXGUARD checks offer letters, quotations, ticket terms and online policies clause by clause. For every flagged clause it shows the exact sentence, a risk level, a plain-language reason, a question to ask before signing, and safer wording to suggest instead.

Team Root Coders (Shiva Kumar, Lavanya, Madhu S, Lakshman G) · HACKNOVA-26 (ANVESHANA-26) · AI/ML

> A review aid, not legal advice. The demo uses synthetic documents only, with no real personal data.

## How it works

```
Web page  / Chrome extension / PDF upload
                 │
         Local server (127.0.0.1:8787, offline)
                 │
  1. Extractor   → numbered clauses with exact character positions
  2. Risk Finder → 32 risk rules (incl. India rule pack) from engine/rules/rules.json
  3. Defender    → searches the whole document for protections, lowers the risk,
                   and checks who each sentence affects (drops your rights and promises to you)
  4. Judge       → LOW / MEDIUM / HIGH, overall score, top-3 questions
                 │
  Highlighted report · clarification email · save as PDF
```

- **Offline:** standard-library Python only. No AI API and no upload; the extension talks only to `127.0.0.1`.
- **Every flag is verifiable:** each one quotes its exact source sentence, and the benchmark checks this.
- **The Defender reduces false alarms:** it only counts a protection that is in the same clause or in a clause on the same topic.
- **Optional AI layer:** a disclosed hook in `engine/ai_layer.py`. It is off and not implemented in this prototype.

## Use it: Chrome extension (no server, no install of Python)

The extension is self-contained. The four agents run inside the browser (`extension/engine.js`), using the same `rules.json` as the Python engine.

1. Download this repository (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension/` folder. It also works in Edge and Brave.
3. On any terms, signup or offer page, click the LEXGUARD icon, then **Check this page**. You can also select text and right-click **Check selected text with LEXGUARD**.
4. Risky sentences are highlighted on the page. The side panel shows the verdict, an "In short" list and short cards with details folded away. Click a card to jump to its sentence, or click a highlight to jump to its card.
5. **Paste or upload a document** opens the full checker. Paste text or upload a `.txt` or `.pdf` (read offline with Mozilla pdf.js), and try the three samples.

Permissions: `activeTab` reads only the tab you open LEXGUARD on. If you check a different tab later, Chrome asks once for that site. No page text leaves the browser.

## Demo kit

`demo/` has everything for a live demo: four synthetic documents as `.txt` and `.pdf` (a risky offer letter scoring 81, a fair one scoring 2, a freelance quote scoring 62, and concert ticket terms scoring 57), a fake signup page for the extension (76), and **`demo/HOW_TO_DEMO.txt`**, a step-by-step 4-minute demo script with setup, what to click, what to say, and fixes if something goes wrong. Rebuild it with `python tools/make_demo_kit.py`.

## How the risk score works

The score is out of 100, and each step is shown in the report under **How was this score worked out?**

1. Every flagged sentence gets a level (LOW, MEDIUM or HIGH) from its rule's weight. The Defender lowers that weight when it finds a protection elsewhere in the document, such as written notice or a refund window.
2. Sentences are grouped by **kind** of risk, for example "Non-refundable payment". Each kind counts **once**, at the level of its worst sentence, so a long document that repeats the same clause 20 times is not punished for its length.
3. Points per kind: **HIGH = 15, MEDIUM = 5, LOW = 1**. The score is the total, capped at 100.
4. **50 or more = HIGH risk, 20–49 = MEDIUM, under 20 = LOW.**

An earlier version added up every flagged sentence, so long terms (Flipkart, Razorpay, Zomato) always scored 99–100. With the per-kind score, the same real pages get: GitHub 84, Flipkart 68, Zomato 65, Razorpay 59, Netflix 56, Spotify 45.

## Who does it affect?

A risky-sounding word is only a risk if **you** carry the cost. The Defender checks who acts in each flagged sentence (`engine/impact.py`, mirrored in `extension/engine.js`):

| Sentence | Result |
|---|---|
| "You can opt out…", "you can reject the change by unsubscribing", "You may opt for…" | Your right: **removed** |
| "We do not disclose your personal information…", "We will not delete Content…" | A promise to you: **removed** |
| "You will not be liable for…" | Protects you: **removed** |
| "Either party may terminate…" | Applies to both sides: **lowered** |
| "We may change…", "You may be charged…", "Flipkart shall not be liable…" | A risk for you: **kept** |

Removed sentences are listed in the report under **Not a risk for you**, so nothing is hidden. On the six real sites, 11 sentences were removed, each checked by hand. On UNFAIR-ToS, precision rose from 54.2% to 56.4% and false HIGH flags fell from 3.6% to 3.0%, while recall stayed at 74.4%.

## What the report shows

- **Verdict and score ring:** one plain sentence and the 0–100 score, with the breakdown one click away.
- **What is this?** What the document is for, who it is between, how long it would take to read, and the main topics it covers in simple words (money, refunds, your account, your data, changes, disputes, and so on). Each topic is marked with its risks or "looks OK".
- **Risks, in short** and **Ask before signing:** the main risks and the questions to ask.
- **How LEXGUARD checked this:** what each of the four agents did on this document (sentences read, rules checked, protections found, score).
- **Cards:** one per flagged sentence, with details folded away. Minor points are hidden behind a button.
- **Light / dark switch:** in the top bar. It remembers your choice; otherwise it follows your system setting.

## Use it: local web app (Python)

Requires Python 3.9+. `pypdf` is optional and only needed for PDF upload.

```bash
python server.py
```

Open http://127.0.0.1:8787, then pick a sample or paste or upload a document. A demo signup page for trying the extension is at http://127.0.0.1:8787/web/demo_signup.html.

After changing `engine/rules/rules.json` or `web/report.js` / `web/style.css`, run `python tools/sync_extension.py` to copy them into the extension. Then run `python -m eval.parity_check` (needs Node.js), which confirms the browser engine still gives exactly the same flags as the Python engine. The last run had 0 differences across 2,891 documents and sentences.

## Test it

```bash
python -m eval.benchmark
python -m eval.public_datasets --split test
```

The first command runs the synthetic samples against the targets in our solution note. The second runs the free public datasets in `datasets/`.

### Results on synthetic samples (`samples/`, 3 documents, 29 planted risks)

| Target | Goal | Result |
|---|---|---|
| Planted risky clauses flagged | ≥ 80% | **100%** |
| Clean clauses wrongly flagged HIGH | ≤ 20% | **0%** |
| Flags that quote their source sentence | 100% | **100%** |
| Processing time, 2-page document | < 10 s | **~20 ms** |

These samples were written by the same team that wrote the rules, so they are a sanity check, not proof. The public datasets below are the honest test.

### Results on public data: LexGLUE UNFAIR-ToS, held-out test split (1,607 sentences)

| Metric | First rules | Round 1 tuning | Now (round 2 + "who it affects" check) |
|---|---|---|---|
| Unfair sentences flagged (recall) | 28.5% | 65.7% | **74.4%** |
| Precision | 45.8% | 54.1% | **56.4%** |
| Fair sentences flagged HIGH | 2.4% | 3.5% | **3.0%** |
| Speed | | | 0.7 ms per sentence |

Recall by type in round 2: Arbitration 86%, Choice of law 85%, Content removal 85%, Limitation of liability 82%, Contract by using 70%, Jurisdiction 69%, Unilateral termination 66%, Unilateral change 60%. Rules were tuned only on the train split and checked on validation.

UNFAIR-ToS marks some clauses as "fair" that LEXGUARD flags on purpose, such as non-refundable payments, auto-renewal and indemnity, so precision understates usefulness for consumers. Full tables are in [`eval/results_public.md`](eval/results_public.md); the baseline is in `eval/results_public_baseline.md`.

### Results on public data: CUAD (510 commercial contracts)

The contracts alternate between two halves: rules were tuned on one half (255 contracts) and are reported on the other, held-out half (255 contracts, 941 annotated clauses).

| CUAD category | Before (round 1 rules) | After (round 2 rules) |
|---|---|---|
| Cap on liability | 29% | **74%** |
| Liquidated damages / exit fee | 51% | **70%** |
| Renewal term | 42% | **69%** |
| Non-compete | 10% | **51%** |
| Covenant not to sue | 2% | **46%** |
| Termination for convenience | 15% | **46%** |
| IP ownership assignment | 0% | **44%** |
| **All 7 categories** | **21%** | **60%** |

CUAD has only positive examples, so false alarms are measured on the fair sentences in UNFAIR-ToS above. Round 2 added 4 rules: termination for convenience, IP assignment, early-exit fee, and promises not to challenge their rights. It also widened the auto-renewal, non-compete and liability-cap patterns.

## Project layout

```
engine/            extractor, risk_finder, defender, judge, doc_type, ai_layer, rules/rules.json
server.py          local HTTP server (standard library)
web/               web page, shared report renderer, demo signup page
extension/         Chrome extension: engine.js (JS port of the 4 agents), side panel, in-page highlights, checker page, pdf.js
samples/           synthetic offer letter, quotation, ticket terms + planted-risk labels
datasets/          UNFAIR-ToS + CUAD (CC BY 4.0, see datasets/README.md)
eval/              benchmark.py, public_datasets.py, parity_check.py (JS = Python), results
tools/             sync_extension.py (copies shared files into extension/, draws icons)
```

## Known limits (prototype)

- No OCR yet: scanned PDFs without a text layer are rejected with a message.
- English only. Kannada/Hindi output is planned.
- The extension can't read Chrome's built-in PDF viewer. Use "Paste or upload a document" for PDFs instead.
- Rule-based recall is about 74% on real Terms of Service and 60% on business contracts, so a clean report does not mean a document is safe.

## AI disclosure

Claude (Anthropic) helped plan the solution note and generated this prototype's code, rules and synthetic samples. The team reviews, tests and extends it.

## Licence

The code is for the HACKNOVA-26 submission. The datasets keep their own CC BY 4.0 licences; see `datasets/README.md`.

## Third-party code

`extension/vendor/pdf.min.js` and `pdf.worker.min.js` are Mozilla pdf.js 3.11.174 (Apache License 2.0, see `extension/vendor/LICENSE-pdfjs.txt`).
