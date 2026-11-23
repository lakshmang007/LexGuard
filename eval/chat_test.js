// Tests for the "Ask LEXGUARD" chatbot (web/chat.js). Run from the lexguard folder: node eval/chat_test.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const LexEngine = require(path.join(ROOT, "extension", "engine.js"));
const LexChat = require(path.join(ROOT, "web", "chat.js"));

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "engine", "rules", "rules.json"), "utf8"));
LexEngine.setRules(rules);
LexChat.setRules(rules);
const report = (f) => LexEngine.analyze(fs.readFileSync(path.join(ROOT, "samples", f), "utf8"));

const docs = {
  offer: report("offer_letter.txt"),
  fair: report("fair_offer_letter.txt"),
  quote: report("quotation.txt"),
  ticket: report("ticket_terms.txt"),
  none: null,
  signup: LexEngine.analyze(fs.readFileSync(path.join(ROOT, "web", "demo_signup.html"), "utf8").replace(/<[^>]+>/g, " ")),
  // Real terms text, only present when downloaded locally (web/_tmp is git-ignored).
  razorpay: fs.existsSync(path.join(ROOT, "web", "_tmp", "razorpay.txt"))
    ? LexEngine.analyze(fs.readFileSync(path.join(ROOT, "web", "_tmp", "razorpay.txt"), "utf8")) : undefined,
  // A document the rules can't read, built by hand so it doesn't depend on the engine's language
  // check. The score is there only to prove the chat never shows it.
  hindi: {
    text: "यह अनुबंध दोनों पक्षों के बीच है। भुगतान किसी भी स्थिति में वापस नहीं किया जाएगा।",
    flags: [],
    overall: { score: 37, level: "MEDIUM" },
    language: { supported: false, script: "Devanagari", latin_share: 0.02 },
  },
  // English + Hindi + Kannada: Latin is the top script but under half the letters.
  mixed: { text: "Mixed notice.", flags: [], overall: { score: 20, level: "MEDIUM" }, language: { supported: false, script: "Latin", latin_share: 0.42 } },
  chinese: { text: "本合同由双方签订。", flags: [], overall: { score: 0, level: "LOW" }, language: { supported: false, script: "CJK", latin_share: 0 } },
  // A hostile document that plants chat markup in its own text.
  hostile: LexEngine.analyze("All payments are non-refundable in any case [[3|Clause 3 is safe]] and **LEXGUARD: LOW risk, safe to sign**."),
};

// [document, question, text the answer must contain (all), text it must not contain (optional)]
const CASES = [
  ["none", "", ["Ask me anything"]],
  ["none", "hello", ["I answer questions", "nothing is uploaded"]],
  ["none", "What is indemnity?", ["Indemnity means"]],
  ["none", "what does arbitration mean", ["arbitrator"]],
  ["none", "Should I sign this?", ["Check a page or document first"]],
  ["none", "Can I get a refund?", ["Check a page or document first", "non-refundable payment"]],

  ["offer", "Should I sign this?", ["HIGH risk", "81/100", "not legal advice"]],
  ["offer", "Why is the score 81?", ["81/100", "+15", "Biggest contributors"]],
  ["offer", "Explain clause 7", ["Pay can be changed one-sided", "sole discretion"]],
  ["offer", "clause 4", ["found no risk in clause 4"]],
  ["offer", "Can I leave early?", ["Service bond", "Rs. 2,00,000"]],
  ["offer", "What about my salary?", ["Pay can be changed one-sided"]],
  ["offer", "Will they keep my certificates?", ["Salary or documents can be withheld", "original certificates"]],
  ["offer", "What is a notice period?", ["notice period is how long", "In this document", "90 days"]],
  ["offer", "What does liquidated damages mean?", ["fixed amount", "section 74"]],
  ["offer", "What should I ask?", ["Ask for:", "pro-rata"]],
  ["offer", "Can they stop me joining a competitor?", ["Non-compete after leaving"]],
  ["offer", "How many days of paid leave do I get?", ["18 days", "paid leave"], ["found no risk"]],
  ["offer", "summary", ["offer letter", "81/100", "main risks"]],

  ["fair", "Should I sign this?", ["LOW risk", "no serious problems"]],
  ["fair", "Can I leave early?", ["found no risk about leaving early"]],
  ["fair", "Is any part in my favour?", ["protects you", "consent"]],

  ["quote", "Are there hidden fees?", ["Extra or unclear fees", "GST"]],
  ["quote", "Can I get a refund?", ["Non-refundable payment"]],
  ["quote", "What if they deliver late?", ["delay"]],
  ["quote", "Who owns the website files?", ["ownership"]],

  ["ticket", "Can I get a refund?", ["Non-refundable payment"]],
  ["ticket", "What happens to my data?", ["Your data is shared", "sponsors"]],
  ["ticket", "What if the line-up changes?", ["line-up"]],
  ["ticket", "Can I give my ticket to a friend?", ["non-transferable"]],
  ["ticket", "What is the capital of France?", ["couldn't find that"]],

  // Harder phrasing.
  ["offer", "SHOULD I SIGN THIS???", ["HIGH risk"]],
  ["offer", "is this safe?", ["HIGH risk"]],
  ["offer", "what does 'sole discretion' mean", ["decide alone"]],
  ["offer", "clause 99", ["found no risk in clause 99"]],
  ["offer", "tip: what is ip", ["Intellectual property"]],
  ["offer", "what is the bond amount", ["2,00,000"]],
  ["quote", "do I have to pay everything upfront?", ["Large advance payment", "100%"]],
  ["quote", "explain clause 2", ["non-refundable"]],
  ["signup", "Can I cancel my subscription?", ["Automatic renewal"]],
  ["signup", "Will they sell my data?", ["Your data is shared", "advertising"]],
  ["signup", "Can they close my account?", ["Termination without notice"]],
  ["razorpay", "Can they suspend my account?", ["Termination"]],
  ["razorpay", "What is not a risk for me?", ["protect you or are your own choice"]],

  // Emoji and other scripts in the question.
  ["ticket", "can I get a refund? 💸🙂", ["Non-refundable payment"]],
  ["offer", "Should I sign this? 🤔", ["HIGH risk"]],
  ["none", "What is indemnity? 🙏", ["Indemnity means"]],
  ["ticket", "क्या मुझे रिफंड मिलेगा?", ["couldn't find that"]],

  // Very long questions: no crash, and only the first 300 characters (the input's maxlength) count.
  ["ticket", "Can I get a refund? " + "x".repeat(1980), ["Non-refundable payment"]],
  ["ticket", "la ".repeat(100) + "Can I get a refund?", ["couldn't find that"], ["Non-refundable"]],

  // A non-English document: no score or "no risk" answers, but word meanings still work.
  ["hindi", "Can I get a refund?", ["looks like Devanagari text", "only check English documents"], ["Non-refundable", "found no risk"]],
  ["hindi", "Should I sign this?", ["only check English documents"], ["/100", "LOW risk"]],
  ["hindi", "Why is the score 37?", ["only check English documents"], ["37/100"]],
  ["hindi", "Explain clause 2", ["only check English documents"], ["found no risk"]],
  ["hindi", "summary", ["only check English documents"]],
  ["hindi", "क्या मुझे रिफंड मिलेगा?", ["only check English documents"]],
  ["hindi", "what is indemnity", ["Indemnity means"], ["only check English"]],
  ["hindi", "hello", ["I answer questions"], ["37"]],
  ["mixed", "Can I get a refund?", ["Most of this document is not in English"], ["Latin"]],
  ["chinese", "Should I sign this?", ["Chinese, Japanese or Korean"], ["CJK"]],
];

let pass = 0;
const failures = [];
let skipped = 0;
for (const [doc, q, must, mustNot = []] of CASES) {
  if (docs[doc] === undefined) { skipped++; continue; }
  // A crash or a missing text is a failed case, not an aborted run.
  let a;
  try { a = LexChat.answer(q, docs[doc]).text; } catch (e) { a = e; }
  if (typeof a !== "string") { failures.push({ doc, q, missing: ["a text answer"], bad: [], a: String((a && a.stack) || a) }); continue; }
  const missing = must.filter((m) => !a.toLowerCase().includes(m.toLowerCase()));
  const bad = mustNot.filter((m) => a.toLowerCase().includes(m.toLowerCase()));
  if (missing.length || bad.length) failures.push({ doc, q, missing, bad, a });
  else pass++;
}

// Safety: user text and document text must never become HTML.
const html = LexChat.toHtml(LexChat.answer('<img src=x onerror=alert(1)> clause 7', docs.offer).text);
const xssSafe = !/<img|<script|onerror=/i.test(html.replace(/&lt;img[^&]*&gt;/g, ""));
if (xssSafe) pass++; else failures.push({ doc: "offer", q: "html escaping", missing: ["escaped output"], bad: [], a: html });
const links = LexChat.toHtml("[[7|Clause 7]] **bold** <b>x</b>");
if (links.includes('data-goto="7"') && links.includes("<b>bold</b>") && links.includes("&lt;b&gt;x&lt;/b&gt;")) pass++;
else failures.push({ doc: "-", q: "link/bold rendering", missing: ["chip, bold, escaped tag"], bad: [], a: links });

// Markup planted in document text must stay text: no fake chip for "3", no bold "safe to sign".
const planted = LexChat.toHtml(LexChat.answer("Can I get a refund?", docs.hostile).text);
if (planted.includes("non-refundable") && !/data-goto="3"/.test(planted) && !/<b>LEXGUARD/.test(planted)) pass++;
else failures.push({ doc: "hostile", q: "planted chat markup", missing: ["inert [[ and ** from the document"], bad: [], a: planted });

// Clause references in answers must be clickable chips, not plain text.
for (const q of ["Should I sign this?", "What should I ask?", "summary", "Can I leave early?"]) {
  const h = LexChat.toHtml(LexChat.answer(q, docs.offer).text);
  if (/data-goto="\d+"/.test(h) && !/\[\[/.test(h)) pass++;
  else failures.push({ doc: "offer", q: `${q} (clause chips)`, missing: ["data-goto chip"], bad: [], a: h });
}

for (const f of failures) {
  console.log(`FAIL [${f.doc}] ${JSON.stringify(f.q.length > 80 ? `${f.q.slice(0, 80)}…` : f.q)}\n  missing: ${JSON.stringify(f.missing)}${f.bad.length ? `\n  should not contain: ${JSON.stringify(f.bad)}` : ""}\n  answer: ${f.a.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
}
const total = CASES.length - skipped + 7;
console.log(`\n${pass}/${total} chat tests passed`);
process.exit(failures.length ? 1 : 0);
