"""Run every LEXGUARD test in order and print a summary. Exits 1 if any step failed.

    python tools/run_all_tests.py             # sync the extension first (what CI runs)
    python tools/run_all_tests.py --no-sync   # leave extension/ alone, only check its copies

Steps that need Node.js are skipped, not failed, when node is not on PATH.
The accuracy run is separate because it rewrites eval/results_public.*: python -m eval.public_datasets --split validation
"""
import argparse
import filecmp
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_extension import COPIES, EXT, ROOT  # noqa: E402  (one list of copies, shared with the sync)

# Children print rule names and quotes; a cp1252 Windows console would crash on them otherwise.
ENV = dict(os.environ, PYTHONIOENCODING="utf-8")


def run(cmd):
    """Run one command from the project folder, streaming its output. True if it exited 0."""
    sys.stdout.flush()
    try:
        return subprocess.run(cmd, cwd=str(ROOT), env=ENV).returncode == 0
    except OSError as e:
        print("could not start:", e)
        return False


def copies_match():
    """Compare each extension copy with its source byte for byte, so this works without git."""
    pairs = list(COPIES.items())
    pairs += [(f, EXT / "samples" / f.name) for f in sorted((ROOT / "samples").glob("*.txt"))]
    bad = [dst for src, dst in pairs
           if not (src.is_file() and dst.is_file() and filecmp.cmp(str(src), str(dst), shallow=False))]
    for dst in bad:
        print("differs from its source:", dst.relative_to(ROOT).as_posix())
    print(f"{len(pairs) - len(bad)}/{len(pairs)} extension copies match their sources.")
    if bad:
        print("Fix: python tools/sync_extension.py")
    return not bad


def main():
    ap = argparse.ArgumentParser(description="Run every LEXGUARD test and print a summary.")
    ap.add_argument("--no-sync", action="store_true", help="skip tools/sync_extension.py; only check the copies")
    args = ap.parse_args()

    py, node = sys.executable, shutil.which("node")
    no_node = None if node else "node is not on PATH"
    steps = [  # (title, command or function, reason to skip or None)
        ("Sync extension copies", [py, str(ROOT / "tools" / "sync_extension.py")], "--no-sync given" if args.no_sync else None),
        ("Extension copies match", copies_match, None),
        ("Benchmark targets", [py, "-m", "eval.benchmark"], None),
        ("Parity Python == JS", [py, "-m", "eval.parity_check"], no_node),
        ("Chat test", [node, str(ROOT / "eval" / "chat_test.js")], no_node),
        ("Server test", [py, "-m", "eval.server_test"],
         None if (ROOT / "eval" / "server_test.py").is_file() else "eval/server_test.py does not exist yet"),
    ]

    results = []
    for i, (title, action, skip) in enumerate(steps, 1):
        print(f"\n==== [{i}/{len(steps)}] {title} ====", flush=True)
        if skip:
            print("SKIPPED:", skip)
            results.append((title, "SKIPPED", None, skip))
            continue
        t0 = time.perf_counter()
        ok = action() if callable(action) else run(action)
        results.append((title, "PASS" if ok else "FAIL", time.perf_counter() - t0, ""))

    width = max(len(t) for t, *_ in results)
    print("\n==== Summary ====")
    print(f"{'Step':<{width}}  {'Result':<7}  {'Time':>7}")
    for title, status, secs, note in results:
        took = f"{secs:5.1f} s" if secs is not None else "      -"
        print(f"{title:<{width}}  {status:<7}  {took}" + (f"  ({note})" if note else ""))
    counts = {s: sum(r[1] == s for r in results) for s in ("PASS", "FAIL", "SKIPPED")}
    print(f"{counts['PASS']} passed, {counts['FAIL']} failed, {counts['SKIPPED']} skipped.")
    return counts["FAIL"] == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
