# Contributing to LEXGUARD

## Set up

You need **Python 3.9+** and **Node.js 18+** (Node is only used by two test scripts). There are no packages to install. `pypdf` is optional and only needed for PDF upload in the local web app (`pip install -r requirements.txt`).

```bash
git clone https://github.com/lakshmang007/LexGuard.git
cd LexGuard
python tools/run_all_tests.py   # sync + every test; should end with "0 failed"
```

To try your changes in Chrome, load the `extension/` folder at `chrome://extensions` (Developer mode → **Load unpacked**). After each change, click the reload button on the LEXGUARD card.

## Where things live

| Change | Edit this | Then |
|---|---|---|
| A risk or protection rule | `engine/rules/rules.json` | `python tools/sync_extension.py` and `python tools/make_rules_doc.py` |
| Engine logic | **both** `engine/*.py` **and** `extension/engine.js` | `python -m eval.parity_check` |
| Report, chat, styles, theme, animations | `web/report.js`, `web/chat.js`, `web/style.css`, `web/theme.js`, `web/motion.js` | `python tools/sync_extension.py` |
| Side panel, checker page, highlighting | `extension/sidepanel.*`, `extension/checker.*`, `extension/content.*` | reload the extension |
| Language check (which documents are refused) | **both** `engine/language.py` **and** `detectLanguage` in `extension/engine.js` | `python -m eval.parity_check` and `python -m eval.benchmark` |
| Local server | `server.py` | `python -m eval.server_test` |
| Sample documents | `samples/*.txt` (+ `samples/labels.json`) | `python tools/sync_extension.py` and `python tools/make_demo_kit.py` |

Never edit the copies in `extension/` of `report.js`, `chat.js`, `style.css`, `theme.js`, `motion.js`, `rules.json` or `samples/`: `sync_extension.py` overwrites them.

## Run the tests

```bash
python tools/run_all_tests.py                  # sync, copies check, benchmark, parity, chat, server: all must pass
python -m eval.public_datasets --split validation   # accuracy on public data (use test only for reported numbers)
```

`run_all_tests.py` runs, in order: `tools/sync_extension.py`, a check that every extension copy matches its source, `python -m eval.benchmark`, `python -m eval.parity_check`, `node eval/chat_test.js` and `python -m eval.server_test`. Use `--no-sync` to only check the copies without rewriting them. The same command runs in GitHub Actions on every push and pull request, which also fails if the sync changed files you didn't commit.

`eval.public_datasets` rewrites `eval/results_public.*` only for `--split test`, so validation runs never overwrite the published numbers.

## Adding or changing a rule

1. Add the rule to `engine/rules/rules.json` with an `id`, `name`, `doc_types`, `weight` (≥ 0.7 starts HIGH, ≥ 0.4 MEDIUM), `patterns` (regular expressions, case-insensitive), and plain-words `reason`, `question` and `safer_wording`. Optionally add `protections`, `exclude_patterns` (for the reader's own rights, such as "you may cancel"), `boost_patterns`, `topic` and `jurisdiction: "IN"`.
2. Write patterns that work in **both** Python `re` and JavaScript `RegExp`: avoid possessive quantifiers, `\Z` and inline flags.
3. Tune against `samples/` and the **train/validation** splits only. Run `--split test` once, at the end, for the numbers you report.
4. Run `python tools/make_rules_doc.py` and `python tools/run_all_tests.py`.
5. If the rule affects who carries the risk, check `engine/impact.py` (and `checkImpact` in `extension/engine.js`).

## Pull requests

- Keep each pull request to one change, and describe what you tested.
- Include the benchmark and parity output if you touched rules or the engine.
- Update `CHANGELOG.md` under **Unreleased**, and bump `version` in `extension/manifest.json` when the extension changes.
- Sample documents must be synthetic: no real names, companies or personal data.
