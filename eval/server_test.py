"""Check the optional local server (server.py): files stay in their folders, no CORS,
the Host guard, body limits, error codes and security headers.

Run from the lexguard folder:  python -m eval.server_test

Starts the server on a free port in a background thread; nothing else needs to be running.
"""
import contextlib
import http.client
import io
import json
import ntpath
import pathlib
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402

CSP = ("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
TIMEOUT = 10  # seconds per request, so a server that waits for bytes that never come fails instead of hanging
PORT = None  # set once the server is listening
CHECKS = []


class Skip(Exception):
    pass


class QuietHandler(server.Handler):
    def log_request(self, code="-", size="-"):  # no access log in the test output; errors still print
        pass


def check(fn):
    CHECKS.append(fn)
    return fn


def expect(ok, detail):
    if not ok:
        raise AssertionError(detail)


def send(method, path, body=None, headers=(), host=True):
    """One request on a fresh connection, path sent as-is (no ../ clean-up), with only these
    headers plus Host (unless host=False) and Content-Length for a body. Returns (status, headers, body)."""
    headers = list(headers)
    if body is not None and not any(k.lower() == "content-length" for k, _ in headers):
        headers.append(("Content-Length", str(len(body))))
    conn = http.client.HTTPConnection(server.HOST, PORT, timeout=TIMEOUT)
    try:
        conn.putrequest(method, path, skip_host=not host, skip_accept_encoding=True)
        for name, value in headers:
            conn.putheader(name, value)
        conn.endheaders(body)
        resp = conn.getresponse()
        return resp.status, resp.headers, resp.read()
    finally:
        conn.close()


def post_json(path, data, headers=()):
    return send("POST", path, json.dumps(data).encode("utf-8"), [("Content-Type", "application/json"), *headers])


def error_of(body):
    return json.loads(body.decode("utf-8")).get("error")


@check
def html_has_csp():
    """GET / and the web pages -> 200 with the Content-Security-Policy header"""
    for path in ("/", "/index.html", "/web/index.html", "/web/demo_signup.html"):
        status, headers, _ = send("GET", path)
        expect(status == 200, f"{path}: status {status}")
        expect(headers.get("Content-Security-Policy") == CSP, f"{path}: CSP {headers.get('Content-Security-Policy')!r}")


@check
def security_headers_everywhere():
    """nosniff and no-referrer on files, JSON, 404 and the stdlib's own error replies"""
    for method, path in (("GET", "/"), ("GET", "/web/style.css"), ("GET", "/health"),
                         ("GET", "/no-such-page"), ("OPTIONS", "/analyze"), ("PUT", "/analyze")):
        with contextlib.redirect_stderr(io.StringIO()):  # the stdlib logs each 501
            status, headers, _ = send(method, path)
        expect(headers.get("X-Content-Type-Options") == "nosniff", f"{method} {path} ({status}): no nosniff")
        expect(headers.get("Referrer-Policy") == "no-referrer", f"{method} {path} ({status}): no Referrer-Policy")


@check
def health_version():
    """/health version comes from extension/manifest.json"""
    manifest = json.loads((ROOT / "extension" / "manifest.json").read_text(encoding="utf-8"))
    status, _, body = send("GET", "/health")
    expect(status == 200, f"status {status}")
    got = json.loads(body)["version"]
    expect(got == manifest["version"], f"version {got!r}, manifest says {manifest['version']!r}")


@check
def files_from_own_folders():
    """Each route still serves the files in its own folder"""
    for path in ("/web/style.css", "/web/app.js", "/extension/manifest.json", "/extension/rules.json",
                 "/samples/offer_letter.txt", "/samples"):
        status, _, _ = send("GET", path)
        expect(status == 200, f"{path}: status {status}")


@check
def traversal_blocked():
    """Paths that leave the route's folder -> 404"""
    paths = [
        "/web/../server.py",
        "/web/../.git/config",
        "/web/../extension/manifest.json",   # inside the project, but not in web/
        "/web/..\\server.py",                # Windows separator
        "/web/_tmp/../../server.py",
        "/web/C:/Windows/win.ini",           # an absolute path replaces the base folder on Windows
        "/web//etc/passwd",
        "/web/",                             # the folder itself
        "/extension/../server.py",
        "/extension/../web/index.html",
        "/samples/../engine/__init__.py",
        "/samples/../samples/../server.py",
        "/web/index.html::$DATA",            # NTFS alternate data stream
    ]
    bad = []
    for path in paths:
        status, _, _ = send("GET", path)
        if status != 404:
            bad.append(f"{path} -> {status}")
    expect(not bad, "; ".join(bad))


@check
def unc_paths_not_opened():
    """UNC and device paths -> 404 without the server opening them (no SMB login)"""
    # 192.0.2.x is a documentation range, so even a regression contacts no real host. The spy
    # refuses network paths, so a regression shows up here instead of as a 21 s SMB timeout.
    opened = []
    real = getattr(ntpath, "_getfinalpathname", None)

    def spy(p):
        opened.append(p)
        if str(p).startswith(("\\\\", "//")):
            raise OSError("network path refused by the test")
        return real(p)
    mods = [m for m in (ntpath, pathlib) if real and hasattr(m, "_getfinalpathname")]
    for m in mods:
        m._getfinalpathname = spy
    paths = ["/web///192.0.2.1/IPC$/x", r"/web/\\192.0.2.1\IPC$\x", "/web///./pipe/lexguard-probe",
             "/samples///192.0.2.1/share/x.txt", r"/extension/\\?\C:\Windows\win.ini"]
    bad = []
    try:
        for path in paths:
            status, _, _ = send("GET", path)
            if status != 404:
                bad.append(f"{path} -> {status}")
    finally:
        for m in mods:
            m._getfinalpathname = real
    unc = [str(p) for p in opened if str(p).startswith(("\\\\", "//"))]
    expect(not bad, "; ".join(bad))
    expect(not unc, f"server opened {unc}")


@check
def script_types():
    """Scripts, styles and pages get fixed types (a bad registry entry can't break them under nosniff)"""
    for path, want in (("/web/app.js", "text/javascript"), ("/web/style.css", "text/css"),
                       ("/", "text/html"), ("/extension/manifest.json", "application/json")):
        _, headers, _ = send("GET", path)
        got = (headers.get("Content-Type") or "").split(";")[0]
        expect(got == want, f"{path}: {got!r}")


@check
def tmp_pages_without_csp():
    """web/_tmp/ pages are still served, without the CSP (they use inline scripts)"""
    pages = sorted(server.TMP.glob("*.html")) if server.TMP.is_dir() else []
    if not pages:
        raise Skip("no web/_tmp/*.html here (the folder is git-ignored)")
    status, headers, _ = send("GET", "/web/_tmp/" + pages[0].name)
    expect(status == 200, f"{pages[0].name}: status {status}")
    expect("Content-Security-Policy" not in headers, f"{pages[0].name}: has a CSP header")


@check
def no_cors():
    """No Access-Control-Allow-Origin header, even when another site asks"""
    origin = [("Origin", "https://evil.example")]
    replies = {
        "GET /health": send("GET", "/health", headers=origin),
        "GET /web/../server.py": send("GET", "/web/../server.py", headers=origin),
        "POST /analyze": post_json("/analyze", {"text": "Hello."}, origin),
    }
    with contextlib.redirect_stderr(io.StringIO()):  # the stdlib logs the 501
        replies["OPTIONS /analyze"] = send("OPTIONS", "/analyze", headers=origin + [
            ("Access-Control-Request-Method", "POST"), ("Access-Control-Request-Headers", "content-type")])
    for name, (status, headers, _) in replies.items():
        acao = [k for k in headers if k.lower().startswith("access-control-")]
        expect(not acao, f"{name} ({status}): {acao}")
    expect(not 200 <= replies["OPTIONS /analyze"][0] < 300, "OPTIONS preflight succeeded")


@check
def host_guard():
    """Host other than 127.0.0.1:<port> / localhost:<port> -> 403"""
    for host in ("evil.example", f"evil.example:{PORT}", f"127.0.0.1:{PORT + 1}", "127.0.0.1"):
        status, _, _ = send("GET", "/health", headers=[("Host", host)], host=False)
        expect(status == 403, f"GET Host {host}: status {status}")
    status, _, _ = send("POST", "/analyze", b'{"text": "Hello."}', [("Host", "evil.example")], host=False)
    expect(status == 403, f"POST Host evil.example: status {status}")
    status, _, _ = send("GET", "/health", host=False)
    expect(status == 403, f"no Host header: status {status}")
    for host in (f"localhost:{PORT}", f"LOCALHOST:{PORT}", f"127.0.0.1:{PORT}"):
        status, _, _ = send("GET", "/health", headers=[("Host", host)], host=False)
        expect(status == 200, f"Host {host}: status {status}")


@check
def analyze_offer_letter():
    """POST /analyze with the sample offer letter -> 200, score 81"""
    text = (ROOT / "samples" / "offer_letter.txt").read_text(encoding="utf-8")
    status, _, body = post_json("/analyze", {"text": text, "doc_type": None, "use_ai": False})
    expect(status == 200, f"status {status}: {body[:200]!r}")
    score = json.loads(body.decode("utf-8"))["overall"]["score"]
    expect(score == 81, f"score {score}")


@check
def bad_json():
    """Bad JSON, or JSON that is not an object -> 400 "Request body must be JSON." """
    for body in (b"{not json", b"\xff\xfe\x00", b"[1, 2]", b'"text"'):
        status, _, reply = send("POST", "/analyze", body, [("Content-Type", "application/json")])
        expect(status == 400, f"{body!r}: status {status}")
        expect(error_of(reply) == "Request body must be JSON.", f"{body!r}: {error_of(reply)!r}")


@check
def empty_text():
    """Empty text, or no Content-Length at all -> 400 "No text to analyse." """
    for body in (json.dumps({"text": "   "}).encode(), json.dumps({"text": 5}).encode(), None):
        status, _, reply = send("POST", "/analyze", body, [("Content-Type", "application/json")])
        expect(status == 400 and error_of(reply) == "No text to analyse.", f"{body!r}: {status} {reply[:100]!r}")


@check
def bad_content_length():
    """Content-Length -1 or not a number -> 400, without hanging"""
    for value in ("-1", "abc", "1.5"):
        status, _, _ = send("POST", "/analyze", headers=[("Content-Length", value)])
        expect(status == 400, f"Content-Length {value}: status {status}")


@check
def too_large():
    """Body over 10 MB, really sent -> 413 reply (not a connection reset)"""
    body = b"x" * (server.MAX_BYTES + 1)
    status, _, reply = send("POST", "/analyze", body, [("Content-Type", "application/json")])
    expect(status == 413, f"status {status}: {reply[:100]!r}")
    expect(error_of(reply) == "Document too large (max 10 MB).", f"{error_of(reply)!r}")
    status, _, _ = send("POST", "/extract", body, [("Content-Type", "application/pdf")])
    expect(status in (413, 501), f"/extract: status {status}")  # 501 when pypdf is not installed


@check
def internal_error_hidden():
    """An unexpected error -> 500 with a fixed message; details only on stderr"""
    def boom(*args, **kwargs):
        raise RuntimeError("secret-detail-1234")
    saved, server.analyze = server.analyze, boom
    log = io.StringIO()
    try:
        with contextlib.redirect_stderr(log):
            status, _, body = post_json("/analyze", {"text": "Hello."})
    finally:
        server.analyze = saved
    expect(status == 500, f"status {status}")
    expect(b"secret-detail" not in body, f"details sent to the client: {body!r}")
    expect("secret-detail-1234" in log.getvalue(), "details not logged to stderr")


@check
def extract_not_a_pdf():
    """/extract with b"not a pdf" -> 400 "Could not read this PDF." """
    try:
        import pypdf  # noqa: F401
    except ImportError:
        raise Skip("pypdf is not installed")
    with contextlib.redirect_stderr(io.StringIO()):  # the server logs why; not needed here
        for body in (b"not a pdf", b"", b"%PDF-1.4\n" + b"\x00" * 64):
            status, _, reply = send("POST", "/extract", body, [("Content-Type", "application/pdf")])
            expect(status == 400, f"{body[:12]!r}: status {status}")
            expect(error_of(reply) == "Could not read this PDF.", f"{body[:12]!r}: {error_of(reply)!r}")


@check
def extract_sample_pdf():
    """/extract with samples/offer_letter.pdf -> 200 with its text"""
    try:
        import pypdf  # noqa: F401
    except ImportError:
        raise Skip("pypdf is not installed")
    with contextlib.redirect_stderr(io.StringIO()):  # pypdf may warn about the file's structure
        status, _, body = send("POST", "/extract", (ROOT / "samples" / "offer_letter.pdf").read_bytes(),
                               [("Content-Type", "application/pdf")])
    expect(status == 200, f"status {status}: {body[:100]!r}")
    expect("OFFER LETTER" in json.loads(body.decode("utf-8"))["text"], "text not found")


def main():
    global PORT
    httpd = ThreadingHTTPServer((server.HOST, 0), QuietHandler)  # port 0: the OS picks a free one
    PORT = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"== Server checks on http://{server.HOST}:{PORT}")
    counts = {"PASS": 0, "FAIL": 0, "SKIP": 0}
    try:
        for fn in CHECKS:
            note = ""
            try:
                fn()
                result = "PASS"
            except Skip as e:
                result, note = "SKIP", str(e)
            except AssertionError as e:
                result, note = "FAIL", str(e)
            except Exception as e:  # a timeout or a refused connection
                result, note = "FAIL", f"{type(e).__name__}: {e}"
            counts[result] += 1
            print(f"   {result}  {fn.__doc__.strip()}" + (f"\n         {note}" if note else ""), flush=True)
    finally:
        httpd.shutdown()
        httpd.server_close()
    print(f"\n{counts['PASS']} passed, {counts['FAIL']} failed, {counts['SKIP']} skipped.")
    return counts["FAIL"] == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
