## What changed

## How I tested it
- [ ] `python tools/sync_extension.py` (no leftover changes in `extension/`)
- [ ] `python -m eval.benchmark`: all PASS
- [ ] `python -m eval.parity_check`: 0 mismatches
- [ ] `node eval/chat_test.js`: all pass
- [ ] Reloaded the extension and tried it on a page

## Checklist
- [ ] `CHANGELOG.md` updated under **Unreleased**
- [ ] Sample documents are synthetic (no real personal data)
