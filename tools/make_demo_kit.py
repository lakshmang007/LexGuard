"""Build the demo kit: sample documents as .txt and .pdf, the demo signup page, and the demo guide.

    python tools/make_demo_kit.py [output folder]      (default: demo/)

Everything in the kit is synthetic: no real company, person or contract.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DOCS = [
    ("1_Risky_Offer_Letter", "offer_letter.txt"),
    ("2_Fair_Offer_Letter", "fair_offer_letter.txt"),
    ("3_Freelance_Quotation", "quotation.txt"),
    ("4_Concert_Ticket_Terms", "ticket_terms.txt"),
]


def wrap(line, width=92):
    out, cur = [], ""
    for word in line.split():
        if cur and len(cur) + len(word) + 1 > width:
            out.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    out.append(cur)
    return out


def write_pdf(text, path):
    """A plain text PDF (Helvetica, A4) with a real text layer, so PDF upload can read it."""
    lines = []
    for line in text.splitlines():
        lines += wrap(line) if line.strip() else [""]
    pages = [lines[i:i + 52] for i in range(0, len(lines), 52)] or [[]]
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    kids = []
    for page in pages:
        body = "BT /F1 10 Tf 50 790 Td 14 TL " + " ".join(f"({esc(t)}) Tj T*" for t in page) + " ET"
        objs.append(f"<< /Length {len(body.encode('latin-1', 'replace'))} >>\nstream\n{body}\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objs)} 0 R >>")
        kids.append(f"{len(objs)} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = b"%PDF-1.4\n", []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1", "replace")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.write_bytes(out)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "demo"
    out.mkdir(parents=True, exist_ok=True)
    for name, src in DOCS:
        text = (ROOT / "samples" / src).read_text(encoding="utf-8")
        (out / f"{name}.txt").write_text(text, encoding="utf-8")
        write_pdf(text, out / f"{name}.pdf")
        print("made", f"{name}.txt / .pdf")
    shutil.copyfile(ROOT / "web" / "demo_signup.html", out / "5_StreamNest_Signup_Page.html")
    shutil.copyfile(ROOT / "tools" / "HOW_TO_DEMO.txt", out / "HOW_TO_DEMO.txt")
    print("made 5_StreamNest_Signup_Page.html, HOW_TO_DEMO.txt")


if __name__ == "__main__":
    main()
