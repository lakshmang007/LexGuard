# Release Readiness Report — LEXGUARD — 2026-11-19

> **Status 2026-11-23 (v0.7.0):** all code findings below are fixed; the Firebase key in history needs the owners (a MIT licence was added after this re-audit). See the [re-audit](release-audit-2026-11-23.md).

## Verdict: GO WITH FIXES
**For the hackathon demo: GO.** A fresh clone builds and runs from the README alone, and every test suite passes. **Before a public release** (Chrome Web Store or wider sharing): rotate or restrict the Google/Firebase API key in the git history (security, High), fix the highlighter's slowdown on very long pages, and add a licence.

## Scorecard
| Area | Critical | High | Medium | Low | Notes |
|---|---|---|---|---|---|
| Code quality | 0 | 0 | 0 | 3 | No leftovers or debug code; the two engines are deliberately duplicated and guarded by a parity test |
| Performance | 0 | 0 | 1 | 1 | Analysis is fast (112 ms for a 194K-char page in the browser); highlighting is O(flags × page) |
| Tests | 0 | 0 | 1 | 1 | 4 suites, all passing; no CI, no server or highlighter tests |
| Security | 0 | 1 | 2 | 4 | See `security-audit-2026-11-19.md` |
| Compatibility | – | – | – | – | See `compatibility-audit-2026-11-19.md` |
| Build & release | 0 | 0 | 1 | 3 | No LICENSE, no requirements.txt, no changelog |

## Fix first
1. **[High, security]** Restrict or rotate the Google/Firebase key `AIza…` that sits in history (`firebase-applet-config.json`, commit `30d90e3`). See the security report.
2. **[Medium, performance]** `extension/content.js:highlight` rebuilds the page index for every flag: 41 s freeze on a 1.17M-character page.
3. **[Medium, release]** Add a `LICENSE`. The repo is public but "all rights reserved" by default.
4. **[Medium, security]** The local server serves every project file to any website (`server.py:_static` + CORS `*`).
5. **[Medium, security]** Set `isEvalSupported: false` for pdf.js 3.11.174 (CVE-2024-4367), and plan the upgrade.
6. **[Medium, tests]** Add CI that runs the four existing suites on every push.

## Findings

### Performance

#### [MEDIUM] Highlighting freezes very long pages: O(flags × page size)
- **Where:** `extension/content.js:highlight()` calls `textIndex()` (a full TreeWalker pass building a per-character map of the page) once **per flagged sentence**, then `indexOf` on the whole flattened page.
- **Evidence (measured in Chrome):**

  | Page | Characters | Flags | Analyze | Highlight |
  |---|---|---|---|---|
  | Razorpay terms | 194,332 | 98 | 112 ms | **924 ms** |
  | 3 × Razorpay | 1,166,558 | 584 | 933 ms | **41,075 ms** |

  Highlighting runs on the page's main thread, so the tab is frozen for that time.
- **Impact:** Typical terms pages take about 1 s, which users notice but can live with. Long legal pages, or several policies on one page, can lock the tab for tens of seconds.
- **Fix:** Build the index once, find every flag's position in the flattened text, then wrap matches from the **last to the first**. Wrapping later text nodes first keeps the stored offsets of earlier ones valid. Expected cost is O(page + flags): estimated under 100 ms for the Razorpay page (not measured).
- **Confidence:** Confirmed (measured).

#### [LOW] Python engine is about 15× slower than the browser engine on long text
- 200K-character Razorpay text: 1.6 s in Python versus 112 ms in the browser. This is fine for the local demo app; note it if the server is ever used for bulk checks.

### Tests

#### [MEDIUM] No continuous integration
- **Where:** there is no `.github/workflows/`. Four suites exist and pass, but only when someone remembers to run them: `eval/benchmark.py` (synthetic targets), `eval/public_datasets.py` (UNFAIR-ToS / CUAD), `eval/parity_check.py` (Python ≡ JS, 2,892 cases), and `eval/chat_test.js` (48 chat cases, +2 when the real-terms texts are present).
- **Impact:** A change to `rules.json` that is not copied to the extension, or a JS-only edit, can break parity without anyone noticing.
- **Fix:** A GitHub Actions workflow with Python 3.9 and Node 20 that runs `python tools/sync_extension.py && git diff --exit-code` (catches unsynced copies), then the benchmark, parity and chat tests.
- **Confidence:** Confirmed.

#### [LOW] Untested areas (sketches)
- `server.py` routes: a test that `/web/../.git/config` returns 404 (after the security fix), that a 10 MB+ body returns 413, and that a non-PDF sent to `/extract` returns 400.
- `content.js` highlighting: a jsdom or browser test that all flags of the Razorpay page are found (98/98 today, checked by hand) and that `clear` restores the original DOM.
- `chat.js`: unicode and emoji questions; very long questions (the 300-character input limit is not enforced in `answer()`).
- Extractor edge cases: an empty document, a document with no punctuation, and headings in CAPITALS.

### Code quality

- **[LOW] Long function:** `web/chat.js:answer()` is 111 lines of intent checks in sequence. Splitting it into a table of `{test, handle}` intents would make adding questions safer.
- **[LOW] Duplicated engine:** `engine/*.py` and `extension/engine.js` implement the same pipeline twice. This is intentional (offline extension plus Python evaluation) and guarded by `eval/parity_check.py` with 0 mismatches. Keep the parity test mandatory (see CI).
- **[LOW] Copies kept in sync by hand:** `web/report.js|style.css|motion.js|theme.js|chat.js`, `engine/rules/rules.json` and `samples/*.txt` are copied into `extension/` by `tools/sync_extension.py`. All copies match today, but nothing checks this automatically (see CI fix).
- No `TODO`/`FIXME`, no `console.log`, no debug flags, no commented-out blocks were found. Python files parse under 3.9, which matches the README.

### Build & release

- **[MEDIUM] No licence.** The repo is public with no `LICENSE`, so others legally may not reuse it, and judges and contributors cannot tell the terms. Bundled third-party code is fine: pdf.js (Apache-2.0, licence included) and the datasets (CC BY 4.0, attributed in `datasets/README.md`). **Fix:** add `LICENSE` (MIT or Apache-2.0 fit) and state the team's choice in the README.
- **[LOW] No `requirements.txt`:** `pypdf` is optional and unpinned (see security report). Add `requirements.txt` with `pypdf>=6.0`.
- **[LOW] Versions disagree:** the extension is `0.5.1` (manifest), but the server's `/health` reports `"version": "0.1"`, and there is no changelog. Add `CHANGELOG.md` and read the version from one place.
- **[LOW] Repo housekeeping:** the GitHub repo now answers as `lakshmang007/LexGuard` (pushes print "This repository moved"); update the remote URL. `lexguard_001` is still on GitHub until the owner deletes it.
- **Chrome Web Store (if published later):** it will need a privacy policy, a justification for each permission (`activeTab`, `scripting`, optional all-sites access), a single-purpose description and store screenshots. The demo video and screenshots in `demo/` can be reused.

### Security and compatibility
See `security-audit-2026-11-19.md` (1 High, 2 Medium, 4 Low) and `compatibility-audit-2026-11-19.md`.

## Not checked
- The extension inside a real Chrome profile (it was driven with Chrome API stand-ins); Edge and Brave.
- Python 3.9 itself was not run: only a syntax check at 3.9 level was done, on Python 3.13.
- Linters and coverage tools (`ruff`, `mypy`, `eslint`, `coverage.py`) are not installed, so coverage is unknown and code was reviewed by hand.
- Memory use on very long pages.

## Commands run
```
git clone https://github.com/lakshmang007/LexGuard.git <tmp>          # fresh-clone check
python -m compileall -q engine eval server.py tools
node --check extension/*.js web/*.js eval/*.js
python -m eval.benchmark                 # 5/5 targets PASS
node eval/chat_test.js                   # 48/48 (+2 with real-terms texts)
python -m eval.parity_check              # 2,892 cases, 0 mismatches
python server.py smoke test              # /health, /, /samples, POST /analyze → 200
ast.parse(..., feature_version=(3, 9))   # all Python files
Chrome (built-in pane): content.js highlight timing on 194K- and 1.17M-char pages
```
Tool versions: Python 3.13.2, Node 22.14.0, Chrome (desktop app pane).
