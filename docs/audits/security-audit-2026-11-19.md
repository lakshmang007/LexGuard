# Security Audit — LEXGUARD — 2026-11-19

## Summary
Overall risk: **High**, driven by a Google/Firebase API key that sits in the public git history of the `lexguard` repo (inherited from the old React/Gemini app). The current code is in good shape: page and PDF text never becomes HTML anywhere (confirmed with a hostile document), and the extension asks for the minimum permissions. The remaining issues are in the optional local Python server (it serves every file in the project folder to any website) and an outdated pdf.js with a known CVE that the extension's built-in security policy already blocks.

| Critical | High | Medium | Low |
|---|---|---|---|
| 0 | 1 | 2 | 4 |

## Act now
- **Restrict or rotate the Google/Firebase API key** `AIza…` (masked) for Google Cloud project `warm-utility-455613-r8`. Go to Google Cloud Console → APIs & Services → Credentials, then restrict it to the Firebase APIs and your domains, or delete it and issue a new one. If the old app is no longer used, shut the project down. Purging it from history only helps **after** rotation.

## Attack surface
- **Entry points:** web page text and link list read by the extension (`readPageFn`), selected text, pasted text, uploaded `.txt`/`.pdf` (pdf.js in the extension, pypdf on the server), chat questions, and the local server's HTTP routes (`/`, `/web/*`, `/extension/*`, `/samples/*`, `/health`, `POST /analyze`, `POST /extract`).
- **Trust boundaries:** web page → extension side panel (extension origin, can run scripts on granted sites); file → pdf.js / pypdf; any website → `127.0.0.1:8787` (CORS `*`).
- **Sensitive assets:** the documents being checked (offer letters can contain salaries and names); files in the project folder.
- **Privileged actions:** the extension injecting `content.js` and CSS into a tab; `chrome.permissions.request` for all sites.

## Findings

#### [HIGH] Google/Firebase API key in public git history: secrets
- **Where:** `firebase-applet-config.json`, added in commit `30d90e3` (2026-05-17), removed from the working tree in `8e3b192`. It is still readable in the history of the public repo.
- **Scenario:** Anyone who clones the repo can read the key. Firebase web keys are designed to be shipped to browsers, but this project was created through AI Studio and the old app called Gemini. If the key has no API or referrer restrictions, it can be used to call other enabled Google APIs (for example Gemini) **billed to the project**, or to hit Firestore under whatever rules are set.
- **Evidence:** `"apiKey": "AIza…"` in `firebase-applet-config.json` (projectId `warm-utility-455613-r8`).
- **Fix:** (1) restrict or rotate the key in Google Cloud Console; (2) check the Firestore/Storage security rules aren't open; (3) optionally purge with `git filter-repo --path firebase-applet-config.json --invert-paths` and force-push, but only after rotating.
- **Confidence:** Likely. The key is confirmed present; whether it is unrestricted was not tested, because that would mean using it.

#### [MEDIUM] Local server lets any website read every file in the project folder: path traversal + CORS
- **Where:** `server.py:_static` (route `/web/<path>`, `/extension/<path>`, `/samples/<path>`) and `_send` (adds `Access-Control-Allow-Origin: *` to every response).
- **Scenario:** While `python server.py` is running, any website the user visits can `fetch("http://127.0.0.1:8787/web/../.git/config")` and read the result, plus anything else under the project folder: downloaded terms in `web/_tmp/`, or private documents the user saved there. The containment check only stops paths that leave the project folder, not paths that leave the folder being served. There is also no `Host` header check, so DNS-rebinding also works.
- **Evidence:** `curl --path-as-is http://127.0.0.1:8787/web/../.git/config` → `200`, with `Access-Control-Allow-Origin: *` for `Origin: https://evil.example`. Also `/web/../server.py` → 200, `/web/../web/_tmp/razorpay.txt` → 200. Paths outside the project (`/web/../../../../Windows/win.ini`) → 404.
- **Fix:** Serve each route only from its own folder, drop the wildcard CORS (the extension no longer calls the server), and reject unexpected `Host` headers:
  ```python
  def _static(self, base, rel):
      path = (base / rel).resolve()
      if base.resolve() not in path.parents or not path.is_file():
          return self._send(404, {"error": "not found"})
      ...
  # in _send: no Access-Control-Allow-Origin header
  # in do_GET/do_POST: if self.headers.get("Host") not in ("127.0.0.1:8787", "localhost:8787"): return self._send(403, ...)
  ```
- **Confidence:** Confirmed.

#### [MEDIUM] Bundled pdf.js 3.11.174 has a known code-execution CVE (CVE-2024-4367): vulnerable dependency
- **Where:** `extension/vendor/pdf.min.js`, used by `extension/checker.js:pdfText` (`pdfjsLib.getDocument({ data })`, `isEvalSupported` left at its default `true`).
- **Scenario:** A malicious PDF with a crafted font can make pdf.js < 4.2.67 run JavaScript. In the **installed extension** this is blocked: Manifest V3's default security policy forbids `eval`/`new Function`, which the exploit needs. It is not blocked when `checker.html` is opened through the local dev server (`http://localhost:8787/extension/checker.html`, no CSP), where a crafted PDF could run script in the `localhost:8787` origin.
- **Evidence:** `vendor/pdf.min.js` header: pdf.js 3.11.174; `checker.js` calls `getDocument({ data: buffer })`; `manifest.json` has no `content_security_policy`, so MV3 defaults apply.
- **Fix:** Pass `isEvalSupported: false` now (one line), and upgrade to pdf.js ≥ 4.2.67 (ES-module build) when convenient:
  ```js
  const pdf = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
  ```
- **Confidence:** Likely. The vulnerable version is confirmed; no exploit PDF was built.

#### [LOW] Negative `Content-Length` hangs a server request: denial of service
- **Where:** `server.py:_body`. `int(self.headers.get("Content-Length"))` of `-1` passes the size check, and `rfile.read(-1)` then waits for the connection to close.
- **Scenario:** A local client or a web page (through CORS) can keep server threads busy. The impact is limited because the server is local and threaded.
- **Evidence:** `curl -X POST -H "Content-Length: -1" .../analyze` hung until the client timed out.
- **Fix:** `if length < 0 or length > MAX_BYTES: raise ValueError(...)`, and set `self.timeout = 15` on the handler.
- **Confidence:** Confirmed.

#### [LOW] Side panel lists `javascript:` links from the page: browser-side
- **Where:** `extension/sidepanel.js` (the "Terms links on this page" list uses `href="${esc(l.href)}"`).
- **Scenario:** A page can show a "Terms of Service" link whose address is `javascript:…`. Escaping stops HTML injection, and MV3's security policy should stop the script from running in the extension. Still, the link should never be offered.
- **Evidence:** In a test, a crafted link rendered as `<a href="javascript:window.__pwn++">` with no code executed.
- **Fix:** Keep only `http:`/`https:` links: `.filter((a) => /^https?:/i.test(a.href))` in `readPageFn`, and add `rel="noopener noreferrer"`.
- **Confidence:** Confirmed (render); execution blocked (Likely).

#### [LOW] Server returns raw exception text with status 500: misconfiguration
- **Where:** `server.py:do_POST` `except Exception as e: self._send(500, {"error": str(e)})`.
- **Scenario:** Internal error messages, such as pypdf parser errors, are returned to any caller. The information leaked is minor, but the status codes are wrong: oversized → 500 instead of 413, bad PDF → 500 instead of 400.
- **Fix:** Map known errors to 400/413 with fixed messages, and log the details server-side only.
- **Confidence:** Confirmed.

#### [LOW] No pinned dependency versions: supply chain
- **Where:** No `requirements.txt` exists. `pypdf` is optional and used at whatever version is installed (older versions have parser DoS CVEs). pdf.js is vendored without a recorded checksum.
- **Fix:** Add `requirements.txt` with `pypdf>=6.0`, and record the pdf.js version and SHA-256 in `extension/vendor/README`.
- **Confidence:** Confirmed.

## Verified safe
- **No HTML injection from documents:** a page whose text, company name and hostname contained `<img onerror>` and `"><svg onload>` payloads, rendered through the summary, cards, highlighted document, terms-links list and six chat answers, produced **0 injected elements, 0 event handlers, 0 executions**. Every renderer escapes before building HTML (`LexReport.esc`, `LexChat.toHtml`).
- **No ReDoS:** crafted 100 KB single-sentence inputs take ≤ 0.4 s in Python and ≤ 30 ms in the browser engine; a real 200 KB terms page takes 1.6 s in Python.
- **Server binds to `127.0.0.1` only**; paths outside the project folder are refused; bodies over 10 MB are refused.
- **Extension permissions are minimal:** `activeTab`, `scripting`, `contextMenus`, `sidePanel`, `storage`; site access is optional and requested on click; no `externally_connectable`, no web-accessible resources, no remote code.
- **No shell or eval on user input:** the only `subprocess` call (`eval/parity_check.py`) uses an argument list, with no shell.
- **Chat:** answers are built from the report and escaped; no network calls; no AI model.

## Hardening recommendations
- Add a `Content-Security-Policy` meta tag to `web/index.html` (`default-src 'self'`), to match the extension's policy.
- Remove `web/_tmp/` from what the server can serve, and keep user documents out of the repo folder.
- Add `rel="noopener noreferrer"` to every `target="_blank"` link.
- Document in `README` that the dev server is for local demos only.

## Not checked
- `gitleaks`, `trufflehog`, `semgrep`, `bandit`, `pip-audit` and `osv-scanner` are not installed. Secrets were searched with `git log -p -G` regexes across all 7 commits; code was reviewed manually.
- Whether the leaked key is restricted (that would require using it).
- A real CVE-2024-4367 exploit PDF; the extension inside real Chrome (tested with Chrome API stand-ins).
