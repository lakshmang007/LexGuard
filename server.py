"""LEXGUARD local server. Standard library only; binds to 127.0.0.1.

    python server.py            -> http://127.0.0.1:8787

Routes
    GET  /                  web page
    GET  /web/<file>        static files from web/
    GET  /extension/<file>  static files from extension/
    GET  /samples           list of sample documents
    GET  /samples/<name>    sample text
    GET  /health            {"ok": true, "version": "<extension version>"}
    POST /analyze           {"text": "...", "doc_type": null, "use_ai": false}
    POST /extract           raw PDF bytes -> {"text": "..."} (needs pypdf)

Each route serves only files inside its own folder. There are no CORS headers, and a
request whose Host is not 127.0.0.1:<port> or localhost:<port> gets 403, so other
websites can't read from the server, even through DNS rebinding.
"""
import io
import json
import mimetypes
import os
import socket
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from engine import analyze

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
EXTENSION = ROOT / "extension"
SAMPLES = ROOT / "samples"
TMP = WEB / "_tmp"  # git-ignored test pages; some use inline scripts, so they get no CSP
HOST, PORT = "127.0.0.1", 8787
MAX_BYTES = 10 * 1024 * 1024
DRAIN_MAX = 64 * 1024 * 1024  # a refused body up to this size is read and dropped; bigger ones just close
VERSION = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))["version"]
CSP = ("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
# On Windows mimetypes reads the registry, which can map .js to text/plain; with nosniff the
# browser would then refuse every script. add_type runs after the registry, so these win.
for _ext, _type in ((".js", "text/javascript"), (".mjs", "text/javascript"), (".css", "text/css"),
                    (".html", "text/html"), (".json", "application/json")):
    mimetypes.add_type(_type, _ext)


class RequestError(Exception):
    """A request we refuse: answered with {"error": message} and this status."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Handler(BaseHTTPRequestHandler):
    server_version = "LEXGUARD/" + VERSION
    timeout = 15  # seconds; a client that stalls mid-request can't hold a thread forever
    # The stdlib's own error replies (unknown method, malformed request) are JSON like ours, not HTML.
    error_content_type = "application/json; charset=utf-8"
    error_message_format = '{"error": "Request not supported (HTTP %(code)d)."}'

    def end_headers(self):
        # Added here so every response gets them, the stdlib's error replies included.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def _send(self, status, body, ctype="application/json; charset=utf-8", csp=True):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if csp and ctype.startswith("text/html"):
            self.send_header("Content-Security-Policy", CSP)
        self.end_headers()
        self.wfile.write(body)

    def _static(self, base, rel):
        # Check the text before touching the disk: on Windows resolve() opens a UNC path such as
        # //host/share, which starts an SMB login to that host. Then resolve (symlinks) and check again.
        parts = rel.replace("\\", "/").split("/")
        if ":" in rel or any(s in ("", ".", "..") for s in parts):
            return self._send(404, {"error": "not found"})
        try:
            path = (base / rel).resolve()
        except (OSError, ValueError):  # e.g. a NUL byte in the path
            path = None
        if path is None or base.resolve() not in path.parents or not path.is_file():
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, path.read_bytes(), ctype, csp=TMP.resolve() not in path.parents)

    def _body(self):
        self._body_read = True
        raw = self.headers.get("Content-Length")
        if raw is None:  # a POST without a body
            return b""
        try:
            length = int(raw)
        except ValueError:
            length = -1
        if length < 0:  # rfile.read(-1) would wait until the client closes the connection
            raise RequestError(400, "Bad Content-Length header.")
        if length > MAX_BYTES:
            self._body_read = False  # _dispatch drops it, so the client sees the 413
            raise RequestError(413, "Document too large (max 10 MB).")
        return self.rfile.read(length)

    def _drain(self):
        # Closing with unread request bytes resets the connection on many systems, and the
        # client then gets a network error instead of our reply. So read and drop them first.
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= DRAIN_MAX:
            self.close_connection = True
            return
        while length > 0:
            chunk = self.rfile.read(min(length, 65536))
            if not chunk:
                break
            length -= len(chunk)

    def _host_ok(self):
        # A DNS-rebinding page reaches 127.0.0.1 under its own name, which shows up here.
        host = (self.headers.get("Host") or "").lower()
        if ":" not in host:
            host += ":80"
        port = self.server.server_address[1]
        return host in (f"127.0.0.1:{port}", f"localhost:{port}")

    def _dispatch(self, route):
        self._body_read = self.command != "POST"
        try:
            if not self._host_ok():
                raise RequestError(403, "Forbidden.")
            route(self.path.split("?")[0])
        except RequestError as e:
            try:
                if not self._body_read:
                    self._drain()
                self._send(e.status, {"error": str(e)})
            except (ConnectionError, socket.timeout):
                self.close_connection = True
        except (ConnectionError, socket.timeout):
            self.close_connection = True  # the client left or stalled; there is no one to answer
        except Exception:  # the page gets a fixed message; the details stay in this terminal
            self.log_error("%s %s failed\n%s", self.command, self.path, traceback.format_exc())
            self._send(500, {"error": "Something went wrong in the LEXGUARD server."})

    def do_GET(self):
        self._dispatch(self._get)

    def do_POST(self):
        self._dispatch(self._post)

    def _get(self, p):
        if p in ("/", "/index.html"):
            return self._static(WEB, "index.html")
        if p.startswith("/web/"):
            return self._static(WEB, p[5:])
        if p.startswith("/extension/"):
            return self._static(EXTENSION, p[11:])
        if p == "/health":
            return self._send(200, {"ok": True, "engine": "rules", "version": VERSION})
        if p == "/samples":
            return self._send(200, sorted(f.name for f in SAMPLES.glob("*.txt")))
        if p.startswith("/samples/"):
            return self._static(SAMPLES, p[9:])
        self._send(404, {"error": "not found"})

    def _post(self, p):
        if p == "/analyze":
            try:
                data = json.loads(self._body() or b"{}")
            except ValueError:  # bad JSON or bad UTF-8
                data = None
            if not isinstance(data, dict):
                raise RequestError(400, "Request body must be JSON.")
            text = data.get("text")
            text = text.strip() if isinstance(text, str) else ""
            if not text:
                raise RequestError(400, "No text to analyse.")
            return self._send(200, analyze(text, data.get("doc_type"), bool(data.get("use_ai"))))
        if p == "/extract":
            try:
                from pypdf import PdfReader
            except ImportError:
                raise RequestError(501, "PDF support needs: pip install pypdf")
            body = self._body()
            try:
                if b"%PDF-" not in body[:1024]:  # the spec lets a little junk come before the header
                    raise ValueError("no %PDF- header")
                reader = PdfReader(io.BytesIO(body))
                text = "\n\n".join((pg.extract_text() or "") for pg in reader.pages)
            except Exception as e:  # pypdf raises many different types for broken files
                self.log_error("unreadable PDF: %r", e)
                raise RequestError(400, "Could not read this PDF.")
            if not text.strip():
                return self._send(422, {"error": "No text layer found. Scanned PDFs need OCR (not in this prototype)."})
            return self._send(200, {"text": text, "pages": len(reader.pages)})
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        sys.stderr.write("[lexguard] " + fmt % args + "\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", PORT))
    ThreadingHTTPServer.allow_reuse_address = False  # fail loudly if the port is taken
    server = ThreadingHTTPServer((HOST, port), Handler)
    print(f"LEXGUARD engine running at http://{HOST}:{port}  (offline, rules only). Ctrl+C to stop.", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
