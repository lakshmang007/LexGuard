"""LEXGUARD local server. Standard library only; binds to 127.0.0.1.

    python server.py            -> http://127.0.0.1:8787

Routes
    GET  /                  web page
    GET  /web/<file>        static files
    GET  /samples           list of sample documents
    GET  /samples/<name>    sample text
    GET  /health            {"ok": true}
    POST /analyze           {"text": "...", "doc_type": null, "use_ai": false}
    POST /extract           raw PDF bytes -> {"text": "..."} (needs pypdf)
"""
import io
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from engine import analyze

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
SAMPLES = ROOT / "samples"
HOST, PORT = "127.0.0.1", 8787
MAX_BYTES = 10 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "LEXGUARD/0.1"

    def _send(self, status, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path):
        path = path.resolve()
        if not path.is_file() or ROOT not in path.parents:
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, path.read_bytes(), ctype)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BYTES:
            raise ValueError("Document too large (max 10 MB).")
        return self.rfile.read(length)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            return self._static(WEB / "index.html")
        if p.startswith("/web/"):
            return self._static(WEB / p[5:])
        if p.startswith("/extension/"):
            return self._static(ROOT / "extension" / p[11:])
        if p == "/health":
            return self._send(200, {"ok": True, "engine": "rules", "version": "0.1"})
        if p == "/samples":
            return self._send(200, sorted(f.name for f in SAMPLES.glob("*.txt")))
        if p.startswith("/samples/"):
            return self._static(SAMPLES / p[9:])
        self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            if self.path == "/analyze":
                data = json.loads(self._body() or b"{}")
                text = (data.get("text") or "").strip()
                if not text:
                    return self._send(400, {"error": "No text to analyse."})
                return self._send(200, analyze(text, data.get("doc_type"), bool(data.get("use_ai"))))
            if self.path == "/extract":
                try:
                    from pypdf import PdfReader
                except ImportError:
                    return self._send(501, {"error": "PDF support needs: pip install pypdf"})
                reader = PdfReader(io.BytesIO(self._body()))
                text = "\n\n".join((pg.extract_text() or "") for pg in reader.pages)
                if not text.strip():
                    return self._send(422, {"error": "No text layer found. Scanned PDFs need OCR (not in this prototype)."})
                return self._send(200, {"text": text, "pages": len(reader.pages)})
            self._send(404, {"error": "not found"})
        except Exception as e:  # report errors to the page instead of dropping the connection
            self._send(500, {"error": str(e)})

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
