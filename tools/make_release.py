"""Build dist/LEXGUARD-<version>.zip: the extension folder, ready for "Load unpacked".

    python tools/make_release.py

Runs the sync first so the zip has the current shared files. Unzip it and choose the
LEXGUARD folder inside at chrome://extensions -> Load unpacked.
"""
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    subprocess.run([sys.executable, str(ROOT / "tools" / "sync_extension.py")], check=True, cwd=ROOT)
    ext = ROOT / "extension"
    version = json.loads((ext / "manifest.json").read_text(encoding="utf-8"))["version"]
    out = ROOT / "dist" / f"LEXGUARD-{version}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(ext.rglob("*")):
            if f.is_file() and "__pycache__" not in f.parts:
                # One top-level folder, so unzipping doesn't spill files into Downloads.
                z.write(f, Path("LEXGUARD") / f.relative_to(ext))
        z.write(ROOT / "LICENSE", "LEXGUARD/LICENSE")
    print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
