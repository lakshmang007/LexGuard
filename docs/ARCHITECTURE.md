# Architecture

LEXGUARD reads a document, finds the sentences that put the reader at risk, and explains them. Everything described here runs on fixed rules: there is no AI model and no network call.

## Components

```
┌──────────────────────────── Chrome extension (extension/) ────────────────────────────┐
│                                                                                       │
│  background.js        toolbar icon + right-click menu → opens the side panel          │
│                                                                                       │
│  sidepanel.html/.js   "Check this page / selected text"                               │
│        │  reads page text with chrome.scripting.executeScript                         │
│        ▼                                                                              │
│  engine.js            Extractor → Risk Finder → Defender (+ impact) → Judge           │
│        │                                                                              │
│        ├──► report.js     verdict, score breakdown, "What is this?", cards (HTML)     │
│        ├──► chat.js       "Ask LEXGUARD" answers from the report, rules, glossary     │
│        └──► content.js    injected into the page: highlights flagged sentences        │
│                                                                                       │
│  checker.html/.js     paste / sample / .txt / .pdf (vendor/pdf.js) → same engine      │
│  rules.json           the 32 risk rules + 18 protections                              │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌──────────── Local web app (optional) ────────────┐
│ server.py (127.0.0.1:8787) → engine/ (Python)    │   same pipeline, same rules.json;
│ web/index.html + app.js → report.js + chat.js    │   used for development and evaluation
└──────────────────────────────────────────────────┘
```

**Shared files.** `web/report.js`, `chat.js`, `style.css`, `theme.js`, `motion.js`, `engine/rules/rules.json` and `samples/*.txt` are the originals. `python tools/sync_extension.py` copies them into `extension/` and redraws the icons.

**Two engines, one behaviour.** `engine/*.py` and `extension/engine.js` implement the same steps. `python -m eval.parity_check` runs both on every sample, every UNFAIR-ToS test sentence and the CUAD clauses, and fails on any difference in flags, levels, weights, notes, impact, score or language result.

## Pipeline

| Step | Python | Browser | What it does |
|---|---|---|---|
| Clean | `engine/__init__.py:clean` | `engine.js:clean` | Normalises line endings and joins lines broken mid-sentence (common in PDF text) |
| Language | `language.py:detect` | `detectLanguage` | Counts letters by script. If a text has 20+ letters and under half are Latin, `language.supported` is false: the report, side panel and chat show an "English documents only" notice instead of a score, and nothing is highlighted |
| Document type | `doc_type.py:detect` | `detect` | Keyword counts pick offer letter, quotation, ticket or online policy; this decides which rules apply |
| 1. Extractor | `extractor.py:extract` | `extract` | Splits into paragraphs, list items, headings and sentences (knows abbreviations like "Rs." and "Pvt."); keeps each clause's exact start/end offsets and its section number |
| 2. Risk Finder | `risk_finder.py:find_risks` | `findRisks` | Matches each clause against the risk rules for this document type (regular expressions); applies exclusions such as "you may cancel" and boosts such as "without notice" |
| 3a. Defender: protections | `defender.py:defend` | `defend` | For each hit, looks for its protections in the same clause or in a clause on the same topic; each protection found lowers the weight |
| 3b. Defender: who does it affect? | `impact.py:check_impact` | `checkImpact` | Finds who acts in the sentence: the reader's own right ("you can opt out") or a promise to the reader ("we do not disclose") is removed, "you will not be liable" is removed, and "either party may…" is lowered by 0.2 |
| 4. Judge | `judge.py:judge` | `judge` | Picks each clause's main risk, sets LOW/MEDIUM/HIGH from the weight (≥ 0.7 HIGH, ≥ 0.4 MEDIUM), groups by kind, scores, and picks the top-3 questions |

## The score

Each **kind** of risk counts once, at the level of its worst sentence: HIGH +15, MEDIUM +5, LOW +1, with the total capped at 100. 50 or more is HIGH risk, 20–49 MEDIUM, and under 20 LOW. Counting per kind rather than per sentence keeps long documents from always hitting 100. The report shows the full breakdown table.

## Ask LEXGUARD (`web/chat.js`)

`LexChat.answer(question, report)` trims the question to 300 characters, then tries an ordered table of intents (`INTENTS`); the first that matches answers:

1. greeting / help
2. a clause or sentence number ("explain clause 7")
3. the score
4. "should I sign / is it safe"
5. what to ask
6. what is not a risk
7. a summary
8. a legal word (a 30-entry glossary)
9. a topic (refunds, fees, data, pay, leaving early, disputes, ownership and so on), mapped to rules; when several topics match, the one with flags in this document wins
10. otherwise, the document sentences that best match the question's words

For a document that is not in English, every question about the document gets the English-only message; greetings and word meanings still work.

Answers are plain text with `[[id|label]]` clause links and `**bold**`. Quoted document text has those markers broken up first, so a page can't plant a fake link or bold text. `LexChat.toHtml` escapes everything, then turns the markers into HTML. `eval/chat_test.js` covers the intents, HTML escaping and clause links.

## Highlighting on the page (`extension/content.js`)

One pass over the page's text nodes builds a lower-cased, whitespace-collapsed copy of the page with a map back to each node and offset. Every flag is then located in that copy (higher levels first; a sentence already claimed by another flag goes to its next copy; a 60-character prefix is the fallback), and the matches are wrapped from last to first so earlier offsets stay valid. On a 30,000-word terms page (98 flags) this takes about 15 ms; the old per-flag approach took about 850 ms.

## Safety properties

- Page, PDF and pasted text is always escaped before it becomes HTML. Tested with hostile documents: see the [security audit](audits/security-audit-2026-11-19.md).
- The extension requests `activeTab`, `scripting`, `contextMenus`, `sidePanel` and `storage`. Access to all sites is optional and requested only when you click **Check this page**.
- Links listed in the side panel are limited to `http:`/`https:` and open with `rel="noopener noreferrer"`. pdf.js runs with `isEvalSupported: false` (CVE-2024-4367).
- Nothing is uploaded: the extension makes no network requests. The local server binds to `127.0.0.1`, sends no CORS headers, refuses other Host names (403), serves each route only from its own folder, and sets a Content-Security-Policy on its pages.

## Known limits
- Only English documents are checked; others get a notice, not a score. Snippets under 20 letters are not checked for language.
- A word split across inline elements (`Split<span>word</span>s`) can't be highlighted.
- Rule-based detection misses about a quarter of unfair website terms (see the README results).

Audit history: [release readiness](audits/release-audit-2026-11-19.md) · [security](audits/security-audit-2026-11-19.md) · [compatibility](audits/compatibility-audit-2026-11-19.md), each with a status section for the fixes in 0.7.0.
