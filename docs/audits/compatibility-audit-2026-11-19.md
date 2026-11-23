# Compatibility Audit — LEXGUARD — 2026-11-19

> **Status 2026-11-23 (v0.7.0):** all code findings below are fixed; the Firebase key in history and the missing licence need the owners. See the [re-audit](release-audit-2026-11-23.md).

## Summary
LEXGUARD works in Chromium at every width from 400 px (side panel) to 1920 px, in light and dark mode, and its scripts run on Windows with Python 3.13 and Node 22. The biggest risk is not a device but a **language**: documents in Hindi, Kannada or other non-Latin scripts produce 0 sentences and a misleading "No serious risks found / LOW" verdict. The extension also does not declare the Chrome version it needs (116+).

**Targets.** Declared in the README: Chrome, Edge and Brave (desktop) for the extension; Python 3.9+ for the optional web app. Assumed: Windows 10/11 (the team's machines); side-panel widths 320–600 px; light and dark mode; English documents.

## Compatibility matrix
| Target | Status | How verified | Issues |
|---|---|---|---|
| Chrome 116+ desktop, extension UI and engine | ✅ Pass | Chromium pane: checker page, side panel code with Chrome API stand-ins, highlighting, chat | — |
| Chrome 116+, real extension install (side panel, permissions prompt, right-click menu) | ❔ Untested | Needs a real Chrome profile | see checklist |
| Chrome < 116 | ❌ Broken (Likely) | Static: `chrome.sidePanel.open`/`setPanelBehavior` need 116+; no `minimum_chrome_version` | #2 |
| Microsoft Edge (Chromium) | ❔ Untested | — | see checklist |
| Brave | ❔ Untested | — | see checklist |
| Firefox, Safari | ❌ Not supported | Static: uses `chrome.sidePanel`, MV3 Chrome APIs | not a declared target |
| Side panel 320 px (narrowest) | ⚠️ Issues | Emulated 320×800 | #4 |
| Side panel 400 px, light | ✅ Pass | Emulated 400×800: report, chat, cards, no horizontal scroll | — |
| 768 px, dark mode | ✅ Pass | Emulated 768×1024 + `prefers-color-scheme: dark` | — |
| 1366×768, 1920×1080 | ✅ Pass | Emulated; two-column layout, no horizontal scroll | — |
| Light/dark switch | ✅ Pass | Toggled, remembered across reloads | — |
| Windows 11, Python 3.13 (web app + all eval scripts) | ✅ Pass | Fresh clone: compile, benchmark, parity, server smoke test | — |
| Python 3.9 | 🔍 No issues statically | `ast.parse(feature_version=(3, 9))` on all files; not run on 3.9 | — |
| Windows console code page cp1252 (no UTF-8) | ✅ Pass | Ran benchmark, parity and dataset eval with `PYTHONIOENCODING` unset, output redirected | — |
| Node 22 (test scripts) | ✅ Pass | `chat_test.js`, `parity_run.js` | — |
| English text with accents and emoji | ✅ Pass | Python + JS engines, "Café Ünïcode Ltd 💸" → 2 clauses, 2 flags | — |
| **Hindi / Kannada documents** | ❌ Broken | Python + JS engines → 0 clauses, 0 flags | #1 |
| Very long pages (1M+ characters) | ⚠️ Issues | Measured: 41 s highlight freeze | #3 |
| Local file pages (`file://`) | 🔍 No issues statically | Needs "Allow access to file URLs" (documented in `HOW_TO_DEMO.txt`) | see checklist |
| PDF in Chrome's built-in viewer | ❌ By design | Extensions cannot read it; upload in the checker instead (documented) | — |
| Scanned PDFs (no text layer) | ❌ By design | No OCR; the checker shows a clear message | — |
| Keyboard-only use | ⚠️ Issues | Static review | #5 |
| Colour contrast (WCAG AA) | ⚠️ Issues | Computed for 19 colour pairs, both themes | #6 |
| `prefers-reduced-motion` | 🔍 No issues statically | `motion.js` and CSS skip animations | — |

Legend: ✅ Pass (exercised) · ⚠️ Works with issues · ❌ Broken · 🔍 No issues found statically (not run) · ❔ Untested

## Issues

#### #1 [HIGH] Non-English documents get a false "LOW risk"
- **Affects:** any document in Hindi, Kannada, Tamil, Telugu or another non-Latin script, which is a realistic case for Indian offer letters and notices.
- **Where:** `engine/extractor.py:extract` and `extension/engine.js:extract` drop sentences with fewer than 4 runs of `[A-Za-z]{2,}`. The judge then reports "No serious risks found" and a score of 0.
- **Evidence:** `analyze("यह नौकरी का प्रस्ताव पत्र है। कंपनी अपने विवेक से वेतन बदल सकती है।")` → 0 clauses, 0 flags (both engines); the same for Kannada.
- **Fix:** Detect when most of the letters are non-Latin and show "LEXGUARD can only read English documents for now" instead of a score. Add a `language` field to the result, a test per engine, and include it in the parity check.
- **Confidence:** Confirmed.

#### #2 [MEDIUM] Required Chrome version not declared
- **Affects:** Chrome 114–115 and Chromium browsers that lag behind. The extension installs, but clicking the icon or the right-click menu fails without any message.
- **Where:** `extension/manifest.json` (no `minimum_chrome_version`); `background.js` uses `chrome.sidePanel.setPanelBehavior` and `chrome.sidePanel.open` (Chrome 116+).
- **Fix:** Add `"minimum_chrome_version": "116"` to `manifest.json`, and state "Chrome/Edge/Brave 116 or newer" in the README.
- **Confidence:** Likely (from the API version requirements; old Chrome not run).

#### #3 [MEDIUM] Highlighting freezes very long pages
- See `release-audit-2026-11-19.md`: 924 ms on a 194K-character page, 41 s on a 1.17M-character page (O(flags × page size) in `content.js`).

#### #4 [LOW] 13 px horizontal scroll at the narrowest side-panel width
- **Affects:** side panel dragged to its minimum (320 px), with "How was this score worked out?" open.
- **Where:** `.breakdown` table in `web/style.css`: four columns need 297 px where 248 px is available.
- **Evidence:** at 320×800, `scrollWidth` 333 > `clientWidth` 320; overflowing elements are `.how-score` → `table.breakdown`.
- **Fix:** `.how-score { overflow-x: auto; }` and, below 360 px, hide the "Sentences" column or let the first column wrap (`table-layout: fixed`).
- **Confidence:** Confirmed.

#### #5 [LOW] Some actions are mouse-only
- **Where:** risk cards are focusable (`tabindex="0"`), but jumping to the sentence only listens for `click`, so Enter does nothing. Highlights on the web page can only be clicked.
- **Fix:** Handle `keydown` (Enter/Space) on `.card[data-id]` the same as click; give cards `role="button"` and an `aria-label`.
- **Confidence:** Likely (static).

#### #6 [LOW] MEDIUM badge contrast just below WCAG AA in light mode
- **Evidence:** `#b06000` on `#fef7e0` = 4.34:1 (needs 4.5:1 for 12 px text). All other 18 pairs pass (4.51–15.27:1).
- **Fix:** Darken `--med` to `#9a5000` (≈ 5.2:1).
- **Confidence:** Confirmed (computed).

#### #7 [LOW] `meta.json` read without an explicit encoding
- **Where:** `eval/public_datasets.py:63`, `read_text()` with no `encoding="utf-8"`. Harmless today because the file is ASCII; add the encoding for consistency.

## Manual test checklist
- [ ] **Chrome 116+, Windows:** Load unpacked `extension/` → pin → open a real terms page → **Check this page** → Chrome asks for access once → highlights appear, score shows, chat answers "Should I sign this?" with clickable clause chips.
- [ ] **Chrome:** right-click selected text → **Check selected text with LEXGUARD** → the panel opens and checks only the selection.
- [ ] **Chrome:** turn on "Allow access to file URLs", open `demo/5_StreamNest_Signup_Page.html` → score 76.
- [ ] **Chrome:** **Paste or upload a document** → upload `demo/1_Risky_Offer_Letter.pdf` → 81 HIGH; `2_Fair_Offer_Letter.pdf` → 2 LOW.
- [ ] **Microsoft Edge 116+:** repeat the first and fourth items (`edge://extensions`, Developer mode).
- [ ] **Brave:** repeat the first item; check that Brave's own sidebar doesn't hide the side panel.
- [ ] **Windows display scaling 150% and 200%:** side panel text is crisp and nothing is clipped.
- [ ] **Keyboard only:** Tab to "Check this page", press Enter, Tab through cards and chat; focus is always visible.
- [ ] **Screen reader (NVDA):** the score ring reads "Risk score 81 out of 100, high risk"; new chat answers are announced (`aria-live`).
- [ ] **Python 3.9:** `py -3.9 server.py` and `py -3.9 -m eval.benchmark` run.

## Recommended CI matrix
```yaml
# .github/workflows/test.yml
name: test
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        python: ["3.9", "3.13"]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "${{ matrix.python }}" }
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: python tools/sync_extension.py && git diff --exit-code   # extension copies in sync
      - run: python -m eval.benchmark
      - run: python -m eval.parity_check
      - run: node eval/chat_test.js
```
