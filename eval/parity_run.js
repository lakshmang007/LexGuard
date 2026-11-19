// Helper for parity_check.py: runs the extension's JS engine on cases read from a JSON file.
const fs = require("fs");
const path = require("path");
const LexEngine = require(path.join(__dirname, "..", "extension", "engine.js"));

const [casesPath, outPath] = process.argv.slice(2);
LexEngine.setRules(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extension", "rules.json"), "utf8")));
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const out = cases.map(({ text, doc_type }) => {
  const r = LexEngine.analyze(text, doc_type);
  return {
    doc_type: r.doc_type.type,
    score: r.overall.score,
    skipped: r.overall.skipped,
    impact: r.flags.map((f) => f.impact),
    breakdown: r.overall.breakdown.map((k) => [k.rule, k.level, k.points, k.sentences, k.defended]),
    flags: r.flags.map((f) => [f.start, f.end, f.rule, f.level, f.weight, f.defender, f.also.map((a) => a.rule)]),
  };
});
fs.writeFileSync(outPath, JSON.stringify(out));
