"""Copy shared files into extension/ and draw its icons. Run after changing rules or the web report.

    python tools/sync_extension.py

The rules, report renderer, styles and samples live in one place (engine/, web/, samples/);
the extension needs its own copies because Chrome loads it as a self-contained folder.
"""
import shutil
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"

COPIES = {
    ROOT / "engine" / "rules" / "rules.json": EXT / "rules.json",
    ROOT / "web" / "report.js": EXT / "report.js",
    ROOT / "web" / "style.css": EXT / "style.css",
    ROOT / "web" / "motion.js": EXT / "motion.js",
    ROOT / "web" / "theme.js": EXT / "theme.js",
}


def png(path, size, pixel):
    """Write an RGBA PNG; pixel(x, y) returns (r, g, b, a) for coordinates in 0..1."""
    rows = []
    ss = 4  # supersampling for smooth edges
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    r, g, b, a = pixel((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
            a = acc[3] / (ss * ss)
            row += bytes([int(acc[0] / acc[3]) if acc[3] else 0, int(acc[1] / acc[3]) if acc[3] else 0,
                          int(acc[2] / acc[3]) if acc[3] else 0, int(a)])
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw = zlib.compress(b"".join(rows), 9)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def icon(x, y):
    blue, white, red = (66, 133, 244, 255), (255, 255, 255, 255), (234, 67, 53, 255)  # Google blue / red
    # Rounded square background.
    r = 0.2
    cx, cy = min(max(x, r), 1 - r), min(max(y, r), 1 - r)
    if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
        return (0, 0, 0, 0)
    # Shield: flat top, sides that curve in to a point.
    if 0.18 <= y <= 0.86:
        half = 0.3 if y < 0.5 else 0.3 * (1 - ((y - 0.5) / 0.36) ** 1.6)
        if abs(x - 0.5) <= half:
            # A red "highlighted sentence" bar across the shield.
            if 0.4 <= y <= 0.5 and abs(x - 0.5) <= half - 0.07:
                return red
            return white
    return blue


def main():
    for src, dst in COPIES.items():
        shutil.copyfile(src, dst)
        print("copied", dst.relative_to(ROOT))
    (EXT / "samples").mkdir(exist_ok=True)
    for f in (ROOT / "samples").glob("*.txt"):
        shutil.copyfile(f, EXT / "samples" / f.name)
        print("copied", (EXT / "samples" / f.name).relative_to(ROOT))
    (EXT / "icons").mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        png(EXT / "icons" / f"icon{size}.png", size, icon)
        print("drew", f"extension/icons/icon{size}.png")


if __name__ == "__main__":
    main()
