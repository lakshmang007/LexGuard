# Release Readiness Re-audit: LEXGUARD 0.7.0, 2026-11-23

Follow-up to the [release](release-audit-2026-11-19.md), [security](security-audit-2026-11-19.md) and [compatibility](compatibility-audit-2026-11-19.md) audits of 2026-11-19. Each fix was made in its own package, then checked by two independent reviewers (with the release-readiness, security-audit and compatibility-audit skills), and the problems they found were repaired before this re-audit.

## Verdict: GO WITH FIXES
**For the demo: GO.** Every finding that the code can fix is fixed and has a test. Two items need the **owners**, not code: restrict or rotate the Google/Firebase key that is still in the git history (High), and choose a licence (Medium).

## Scorecard (open items only)
| Area | Critical | High | Medium | Low | Notes |
|---|---|---|---|---|---|
| Code quality | 0 | 0 | 0 | 1 | Python engine still ~15× slower than the browser engine on long text (dev-only) |
| Performance | 0 | 0 | 0 | 0 | Highlighting: 98 flags on a 194K-char page in ~15 ms (was ~850 ms) |
| Tests | 0 | 0 | 0 | 1 | No automated highlighter test (checked by hand in the browser) |
| Security | 0 | 1 | 0 | 0 | The old key in git history; everything else fixed |
| Compatibility | 0 | 0 | 0 | 1 | Snippets under 20 letters aren't language-checked |
| Build & release | 0 | 0 | 1 | 1 | No LICENSE; CI not yet run on GitHub |

## Status of the 2026-11-19 findings
| Finding | Was | Status | Evidence |
|---|---|---|---|
| Google/Firebase key `AIza…` in history (commit `30d90e3`) | High | **Open: owner action** | `git log -S` still finds it. Restrict the key to its app or rotate it in Google Cloud; rewriting history alone doesn't help once it's public |
| Local server: path traversal + CORS `*` | Medium | Fixed | `server.py:_static` refuses `..`, `:`, empty segments, UNC/device paths before touching the disk, then checks the resolved path; no CORS; Host check (403). `eval/server_test.py` 18/18 |
| pdf.js CVE-2024-4367 | Medium | Fixed (mitigated) | `extension/checker.js:15` `isEvalSupported: false`. Upgrading pdf.js to ≥ 4.2.67 is still worth doing |
| Negative `Content-Length` hangs | Low | Fixed | 400 at once; body over 10 MB gets a real 413 (server test) |
| `javascript:` links in the side panel | Low | Fixed | `extension/sidepanel.js:26` keeps `http(s)` only; links open with `rel="noopener noreferrer"` |
| Raw exception text in 500s | Low | Fixed | Fixed message; traceback on stderr only (server test forces an error) |
| No pinned dependency versions | Low | Fixed | `requirements.txt`: `pypdf>=6.0` (optional) |
| Highlighting O(flags × page) | Medium | Fixed | `extension/content.js`: one index per check. 194K chars/98 flags 853 → ~15 ms; 1.17M chars/583 flags 41 s → ~0.12 s; identical marks to the old code |
| No CI | Medium | Fixed | `.github/workflows/test.yml`: Ubuntu 24.04 + Windows, Python 3.9 + 3.13, runs `tools/run_all_tests.py` and fails on uncommitted extension copies |
| No LICENSE | Medium | **Open: owner choice** | No licence file; README says all rights reserved |
| Non-English documents get a false LOW | High | Fixed | `engine/language.py` + `detectLanguage`; notice instead of a score in report, side panel, checker, web app and chat. Benchmark target + 3 parity cases |
| No `minimum_chrome_version` | Medium | Fixed | `extension/manifest.json`: `"116"` |
| 13 px horizontal scroll at 320 px | Low | Fixed | Breakdown hides its Sentences column under 340 px container width; web app at 320 px: scrollWidth = clientWidth |
| Mouse-only cards | Low | Fixed | Enter/Space on a card jumps to its sentence (`keydown` handlers in `web/app.js`, `extension/checker.js`, `extension/sidepanel.js`); `role="button"` + label |
| MEDIUM badge contrast 4.34:1 | Low | Fixed | `--med: #9a5000` → 5.56:1 on `#fef7e0` |
| `meta.json` read without encoding | Low | Fixed | `eval/public_datasets.py:65` |
| Chat `answer()` 111 lines | Low | Fixed | Ordered `INTENTS` table, `answer()` 19 lines; 0 differences on 8,196 question/document pairs vs the old code |
| `/health` version "0.1" | Low | Fixed | Read from the manifest (server test) |

## New issues found and fixed during this round
- Turkish "İ" on a page shifted all later highlights (found in the old code; fixed, then a reviewer caught a regression in the first fix, also fixed).
- Windows registry MIME types could break the web app under `nosniff`; types for `.js/.css/.html/.json` are now pinned.
- Validation runs of `eval.public_datasets` overwrote the published test-split tables; it now writes them only for `--split test`.
- Document text could plant `[[n|label]]` chips or `**bold**` in chat answers (UI spoofing only, no script). Markers in quoted text are now broken up; covered by a chat test.
- CI's `git diff --exit-code` ignored untracked copies; it now uses `git add --intent-to-add` first. `ubuntu-latest` was pinned to `ubuntu-24.04`, which still has Python 3.9.

## Remaining Low items
- No automated test for `extension/content.js` (sketch: jsdom page + the 21 edge-case DOMs used in review).
- A word split across inline elements (`Split<span>word</span>s`) isn't highlighted (same as before).
- Role `button` on a card that contains a `<details>` is flagged by axe as nested-interactive; screen readers still reach "See details".
- CI legs don't install `requirements.txt`, so the two PDF server checks are skipped there.

## Not checked
- The GitHub Actions workflow has not run on GitHub yet; check the first run after pushing.
- The extension in a real Chrome 116 install (checked in the current Chromium pane and by reasoning about API versions).
- Screen-reader output (NVDA/VoiceOver) was not listened to.

## Commands run
```
python tools/run_all_tests.py                 # 6 passed, 0 failed (sync, copies, benchmark 6/6, parity 2,901/0 mismatches, chat 67/67, server 18/18)
python -m eval.public_datasets --split test   # UNFAIR-ToS recall 74.4%, precision 56.4%, fair HIGH 3.0% (unchanged)
git log --all --oneline -S"AIza"
```
Python 3.13.2 and 3.11, Node 22.14, Windows 11. With the git-ignored real terms files in `web/_tmp`; a fresh clone runs 2,895 parity cases and 65 chat tests.
