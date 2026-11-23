// "Ask LEXGUARD": an offline question-and-answer helper for the checked document.
// No AI model and no network: answers come from the current report, the rule library and a
// plain-words glossary, and every document answer quotes the sentence it is based on.
const LexChat = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = (reason) => reason.split(/(?<=\.)\s+/)[0];
  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  // ---- Knowledge: legal words in plain language ---------------------------------------------
  const GLOSSARY = [
    [["indemnity", "indemnify", "indemnification"], "Indemnity means you promise to pay the other side's costs, losses or legal bills if something goes wrong because of you. A one-sided indemnity protects only them."],
    [["liability", "liable"], "Liability means being legally responsible for paying for loss or damage. \"Not liable\" means they won't pay you even if something goes wrong."],
    [["limitation of liability", "liability cap", "cap on liability"], "A limitation of liability sets a maximum, often small, that the other side will ever pay you, however big your loss."],
    [["arbitration", "arbitrator", "arbitrate"], "Arbitration means a dispute is decided by a private arbitrator instead of a court. It can be faster, but it is often chosen and paid for by the company, and you may lose the right to go to court."],
    [["jurisdiction"], "Jurisdiction means which city's or country's courts can hear a dispute. \"Exclusive jurisdiction in Mumbai\" means you would have to go to Mumbai to fight it."],
    [["governing law", "choice of law"], "Governing law means which country's or state's law applies to the contract. A foreign law may give you fewer protections than Indian consumer law."],
    [["liquidated damages"], "Liquidated damages are a fixed amount you agree to pay if you break the contract, for example leaving a job early. Indian courts usually allow only reasonable compensation (Indian Contract Act, section 74)."],
    [["force majeure"], "Force majeure means events outside anyone's control, like floods, war or pandemics. The clause usually says no one is responsible if such an event stops them from keeping their promise."],
    [["non-compete", "non compete", "noncompete"], "A non-compete stops you working for a competitor or starting a similar business for some time after you leave. In India, post-employment non-competes are generally not enforceable (Indian Contract Act, section 27)."],
    [["notice period"], "A notice period is how long you (or they) must wait after giving notice before the job or contract ends. 30 days is common; 90 days makes it hard to join a new job quickly."],
    [["service bond", "bond", "training bond"], "A service bond makes you stay for a minimum time or pay a penalty if you leave early. Ask whether it reduces pro-rata for time you have served and what costs it really covers."],
    [["probation"], "Probation is a trial period at the start of a job, usually with a shorter notice period and less job security."],
    [["waiver", "waive"], "A waiver means you give up a right, for example the right to claim damages or go to court."],
    [["statutory rights", "consumer rights", "consumer protection"], "Statutory rights are rights the law gives you that a contract cannot take away, such as protections under India's Consumer Protection Act, 2019."],
    [["sole discretion", "absolute discretion", "at its discretion"], "\"At its sole discretion\" means the company can decide alone, without asking you or giving reasons."],
    [["auto-renewal", "auto renewal", "automatically renew", "renews automatically"], "Auto-renewal means the subscription or contract continues and you are charged again unless you cancel in time."],
    [["non-refundable", "non refundable", "no refund"], "Non-refundable means you will not get your money back, even if you cancel or don't use the service."],
    [["pro-rata", "pro rata", "prorata"], "Pro-rata means in proportion. A pro-rata bond gets smaller for each month you have already served."],
    [["terminate", "termination"], "Terminate means end the contract, the job or your account."],
    [["consequential damages", "indirect damages", "incidental damages"], "Consequential damages are knock-on losses, like lost profits or lost data. Many terms say the company won't pay for these."],
    [["intellectual property", "ip"], "Intellectual property (IP) means ownership of creative work: code, designs, writing, inventions, logos."],
    [["assign", "assignment"], "To assign means to hand over rights or ownership to someone else, for example assigning the copyright in your work to a client."],
    [["ctc", "cost to company"], "CTC (cost to company) is your total yearly package, including parts you may not get as cash, like employer PF or insurance."],
    [["gst"], "GST is India's Goods and Services Tax. \"GST extra\" means the price you see goes up by the tax, often 18%."],
    [["escalation", "price escalation"], "Price escalation means the price can go up during the contract."],
    [["advance", "advance payment"], "An advance payment is money paid before the work is done. A large advance leaves you exposed if the work is late or poor."],
    [["confidentiality", "confidential information"], "Confidentiality means you must keep the other side's private information secret, usually during and after the contract."],
    [["relieving letter", "experience letter"], "A relieving letter confirms you have left a job properly. New employers often ask for it, so withholding it can block your next job."],
    [["full and final settlement", "full and final", "f&f"], "Full and final settlement is the last payment when you leave a job: pending salary, leave encashment and so on."],
    [["unilateral", "one-sided"], "Unilateral or one-sided means only one party (usually the company) can do it, without the other's agreement."],
  ];

  // ---- Knowledge: what people ask about, mapped to rules ------------------------------------
  const TOPICS = [
    [/\b(refund|money back|cancel\w*|non-?refundable)\b/i, ["non_refundable", "auto_renewal", "provider_cancellation", "exit_fee"], "refunds and cancelling"],
    [/\b(data|privacy|personal (?:data|information|details)|share my|sell my|cookies?)\b/i, ["data_sharing"], "your data"],
    [/\b(salary|pay|ctc|compensation|wage|increment|bonus)\b/i, ["pay_change", "withhold_documents"], "your pay"],
    [/\b(bond|leave early|quit|resign\w*|leaving|exit penalty)\b/i, ["service_bond", "exit_fee", "long_notice_period", "withhold_documents"], "leaving early"],
    [/\b(notice period|notice)\b/i, ["long_notice_period", "termination_without_notice"], "notice"],
    [/\b(fire[ds]?|terminat\w*|suspend\w*|ban(?:ned)?|block\w*|close my account|delete my account)\b/i, ["termination_without_notice", "termination_for_convenience", "content_removal"], "being cut off or terminated"],
    [/\b(fees?|charges?|gst|tax(?:es)?|price|cost|hidden|extra)\b/i, ["hidden_fees", "price_escalation", "late_interest", "full_advance"], "fees and price"],
    [/\b(change the terms|change terms|update the terms|modify|changes?)\b/i, ["unilateral_change", "contract_by_using", "price_escalation"], "changes to the terms"],
    [/\b(court|dispute|arbitrat\w*|sue|lawsuit|law applies|legal action)\b/i, ["mandatory_arbitration", "exclusive_jurisdiction", "choice_of_law", "waiver_of_claims", "no_challenge"], "disputes and courts"],
    [/\b(liab\w*|damages?|responsible|compensat\w* for|my loss|goes wrong)\b/i, ["limitation_of_liability", "waiver_of_claims", "one_sided_indemnity", "delay_no_liability"], "who pays when something goes wrong"],
    [/\b(own(?:ership)?|copyright|intellectual property|my work|my project|portfolio|\bip\b)\b/i, ["ip_assignment", "ip_overreach", "no_challenge"], "ownership of your work"],
    [/\b(compet\w*|another job|next job|rival)\b/i, ["non_compete"], "working elsewhere later"],
    [/\b(transfer\w*|relocat\w*|another city|location)\b/i, ["transfer_anywhere", "non_transferable"], "transfers"],
    [/\b(probation)\b/i, ["probation_extension"], "probation"],
    [/\b(renew\w*|subscription|auto-?pay)\b/i, ["auto_renewal"], "renewal"],
    [/\b(event|line-?up|venue|show|concert|ticket)\b/i, ["provider_cancellation", "non_transferable"], "the event"],
    [/\b(deadline|delay\w*|late)\b/i, ["delay_no_liability", "late_interest"], "delays"],
    [/\b(advance|upfront|pay first)\b/i, ["full_advance"], "advance payment"],
    [/\b(certificates?|documents?|relieving)\b/i, ["withhold_documents"], "your documents"],
  ];

  const STOP = new Set("a an the is are was were be been am i me my mine you your we our they their it its this that these those of to in on for with by at from as or and but if then so do does did can could should would will shall may might must what which who whom whose why how when where there here any all some no not yes about into over under than too very just also only please tell explain mean means meaning say says said document contract terms page".split(" "));
  const words = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  const stem = (w) => w.replace(/(ings?|ed|es|s)$/, "");

  let RULES = null;
  async function loadRules(url) {
    if (!RULES) {
      try { RULES = (await (await fetch(url)).json()).risks; } catch { RULES = []; }
    }
    return RULES;
  }
  function setRules(raw) { RULES = raw.risks || raw; }

  // ---- Helpers --------------------------------------------------------------------------------
  const link = (f) => `[[${f.id}|${f.label}]]`;
  // Document text must not turn into chat markup: break up "[[" and "**" with a zero-width space,
  // so a page can't plant a fake clause link or bold "safe to sign" inside an answer.
  const defuse = (t) => t.replace(/\[\[/g, "[​[").replace(/\*\*/g, "*​*");
  const quote = (t) => `“${defuse(t.length > 220 ? `${t.slice(0, 220).trim()}…` : t)}”`;

  function flagLine(f) {
    return `${link(f)} **${f.level}: ${f.risk_name}.** ${quote(f.text)}\n${plain(f.reason)}${f.defended ? " (The Defender found a protection that lowers this.)" : ""}\nAsk: ${f.question}`;
  }

  function sentencesOf(text) {
    const out = [];
    const re = /[^.!?\n]+[.!?]?/g;
    let m;
    while ((m = re.exec(text))) {
      const s = m[0].trim();
      if (s.split(/\s+/).length >= 5) out.push({ text: s, start: m.index });
    }
    return out;
  }

  function search(report, question, limit = 2) {
    const q = [...new Set(words(question).map(stem))];
    if (!q.length || !report) return [];
    return sentencesOf(report.text)
      .map((s) => {
        const ws = new Set(words(s.text).map(stem));
        const hits = q.filter((w) => ws.has(w)).length;
        return { ...s, score: hits / Math.sqrt(q.length) + (hits === q.length ? 0.5 : 0) };
      })
      .filter((s) => s.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function glossaryHit(question) {
    const q = ` ${question.toLowerCase().replace(/[^a-z0-9&\- ]/g, " ").replace(/\s+/g, " ")} `;
    let best = null;
    for (const [terms, text] of GLOSSARY) {
      for (const t of terms) {
        if (q.includes(` ${t} `) || q.includes(` ${t}s `)) {
          if (!best || t.length > best.term.length) best = { term: t, text };
        }
      }
    }
    return best;
  }

  const sorted = (flags) => [...flags].sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.weight - a.weight);
  // A flag is about some rules when its own rule, or one merged into it, is among them.
  const touches = (f, rules) => rules.includes(f.rule) || f.also.some((a) => rules.includes(a.rule));

  // report.language marks text that is mostly not Latin script. The rules only know English
  // wording, so answering from such a report would be a false "no risk".
  const foreignLanguage = (report) => (report && report.language && report.language.supported === false ? report.language : null);

  // ---- Answers ----------------------------------------------------------------------------------
  const MAX_QUESTION = 300; // the input's maxlength
  const NEED_REPORT = "Check a page or document first (\"Check this page\" or upload a file), then ask me about it. You can still ask what a legal word means, like \"What is indemnity?\".";
  // Same wording as the report's notice (web/report.js languageNotice): "Latin" as the top script
  // of a mostly non-English document would contradict "English only", so call it mixed.
  const SCRIPT_NAMES = { CJK: "Chinese, Japanese or Korean", Other: "non-English" };
  const englishOnly = (lang) => `${!lang.script || lang.script === "Latin" ? "Most of this document is not in English" : `This document looks like ${SCRIPT_NAMES[lang.script] || lang.script} text`}. LEXGUARD can only check English documents for now, so I can't answer questions about it. You can still ask what a legal word means.`;

  // A non-English report has no score worth showing, so the example falls back to "high".
  function greet({ o, foreign }) {
    return { text: "I answer questions about the document LEXGUARD just checked, using its report and rules. I don't use any AI service and nothing is uploaded. Try:\n• \"Should I sign this?\"\n• \"Why is the score " + (o && !foreign ? o.score : "high") + "?\"\n• \"Can I get a refund?\"\n• \"What does arbitration mean?\"\n• \"Explain clause 5\"" };
  }

  function explainClause({ flags, o }, [, kind, num]) {
    const matchKind = kind === "sentence" ? (f) => !f.section && String(f.id) === num : (f) => f.section === num;
    const hits = flags.filter(matchKind);
    if (hits.length) return { text: hits.map(flagLine).join("\n\n"), refs: hits.map((f) => f.id) };
    const skipped = (o.skipped_examples || []).filter((s) => s.label.toLowerCase() === `${kind === "sentence" ? "sentence" : "clause"} ${num}`);
    if (skipped.length) return { text: `${skipped[0].label} is not a risk for you: ${skipped[0].reason} ${quote(skipped[0].text)}` };
    return { text: `LEXGUARD found no risk in ${kind} ${num}. That doesn't prove it is fine: the rules only know common risky wording, so read it yourself if it matters to you.` };
  }

  function explainScore({ o }) {
    const top = o.breakdown.slice(0, 4).map((k) => `• ${k.name}: ${k.level} (+${k.points})`).join("\n");
    return { text: `The score is ${o.score}/100 (${o.level} risk). Each kind of risk counts once: serious +15, medium +5, minor +1, capped at 100. Here: ${o.kind_counts.HIGH} serious, ${o.kind_counts.MEDIUM} medium and ${o.kind_counts.LOW} minor kinds = ${o.points} points.${top ? `\nBiggest contributors:\n${top}` : ""}` };
  }

  function verdict({ o }) {
    const qs = o.top_questions.map((t) => `• [[${t.clause_id}|${t.label}]] ${t.question}`).join("\n");
    const head = o.level === "HIGH" ? `This looks HIGH risk (${o.score}/100). Don't sign or agree until you have answers to these:`
      : o.level === "MEDIUM" ? `This is MEDIUM risk (${o.score}/100). It may be fine, but first ask:`
        : `This looks LOW risk (${o.score}/100): LEXGUARD found no serious problems.`;
    return { text: `${head}${qs ? `\n${qs}` : ""}\nLEXGUARD is a review aid, not legal advice. For an important contract, ask someone you trust or a lawyer.`, refs: o.top_questions.map((t) => t.clause_id) };
  }

  function whatToAsk({ flags }) {
    const top = sorted(flags).filter((f) => f.level !== "LOW").slice(0, 4);
    if (!top.length) return { text: "There are no medium or high risks to ask about. You could still ask for anything you don't understand to be explained in writing." };
    return { text: "Ask for these, in this order:\n" + top.map((f) => `• ${link(f)} ${f.question}\n  Ask for: “${f.safer_wording}”`).join("\n") + "\nTip: \"Copy clarification email\" puts all of this into a ready email.", refs: top.map((f) => f.id) };
  }

  function protections({ flags, o }) {
    const ex = o.skipped_examples || [];
    const defended = flags.filter((f) => f.defended).slice(0, 3);
    const parts = [];
    if (ex.length) parts.push(`${o.skipped} sentence(s) sound risky but protect you or are your own choice, so they weren't counted:\n` + ex.slice(0, 3).map((s) => `• ${s.label}: ${quote(s.text)} (${s.reason})`).join("\n"));
    if (defended.length) parts.push("These risks are lowered because the document also protects you:\n" + defended.map((f) => `• ${link(f)} ${f.risk_name}: ${f.defender}`).join("\n"));
    return { text: parts.join("\n\n") || "LEXGUARD didn't find sentences that protect you here. That doesn't mean there are none, only that its rules didn't spot them.", refs: defended.map((f) => f.id) };
  }

  function summary({ report, flags, o }) {
    const top = sorted(flags).filter((f) => f.level !== "LOW").slice(0, 3);
    return { text: `This is a ${report.doc_type.label.toLowerCase()} with ${report.clause_count} sentences, scored ${o.score}/100 (${o.level} risk).` + (top.length ? `\nThe main risks:\n${top.map((f) => `• ${link(f)} ${f.risk_name}: ${plain(f.reason)}`).join("\n")}` : "\nNo medium or high risks were found."), refs: top.map((f) => f.id) };
  }

  // The meaning, plus where this document uses the word (never quoted from a non-English report).
  function defineWord({ report, flags, foreign }, g) {
    const topic = TOPICS.find(([re]) => re.test(g.term));
    const inDoc = report && !foreign && topic ? flags.filter((f) => topic[1].includes(f.rule)) : [];
    return { text: g.text + (inDoc.length ? `\n\nIn this document: ${inDoc.slice(0, 2).map((f) => `${link(f)} ${quote(f.text)}`).join(" ")}` : ""), refs: inDoc.slice(0, 2).map((f) => f.id) };
  }

  // When several topics match ("pay everything upfront"), prefer the one this document actually
  // has risks for, then the one with more matching words.
  function pickTopic(q, flags) {
    const hasRule = (rules) => flags.some((f) => touches(f, rules));
    return TOPICS
      .map((t, i) => ({ t, i, n: (q.match(new RegExp(t[0].source, "gi")) || []).length }))
      .filter((x) => x.n)
      .sort((a, b) => hasRule(b.t[1]) - hasRule(a.t[1]) || b.n - a.n || a.i - b.i)
      .map((x) => x.t)[0];
  }

  function topicAnswer({ report, flags, question }, [, rules, name]) {
    const hits = sorted(flags.filter((f) => touches(f, rules)));
    if (hits.length) {
      return { text: `About ${name}, this document has ${hits.length} flagged sentence(s):\n\n${hits.slice(0, 3).map(flagLine).join("\n\n")}${hits.length > 3 ? `\n\n…and ${hits.length - 3} more in the cards below.` : ""}`, refs: hits.slice(0, 3).map((f) => f.id) };
    }
    const found = search(report, question);
    return { text: `LEXGUARD found no risk about ${name} in this document.` + (found.length ? `\nThe document mentions it here:\n${found.map((s) => `• ${quote(s.text)}`).join("\n")}` : "") };
  }

  // Before any check, say what LEXGUARD would look for on this topic.
  function topicRules(ctx, [, rules, name]) {
    const known = (RULES || []).filter((r) => rules.includes(r.id));
    return { text: `${NEED_REPORT}\nAbout ${name}, LEXGUARD looks for: ${known.map((r) => r.name.toLowerCase()).join(", ") || rules.join(", ")}.` };
  }

  function bestMatches({ report, question }) {
    const found = search(report, question);
    if (found.length) {
      return { text: `I don't have a ready answer, but these parts of the document match your question:\n${found.map((s) => `• ${quote(s.text)}`).join("\n")}\nRead them carefully, and ask the other side if anything is unclear.` };
    }
    return { text: "I couldn't find that in this document. Try asking about refunds, fees, your data, notice period, cancelling, or a clause number, or ask what a legal word means." };
  }

  // ---- Intents ----------------------------------------------------------------------------------
  // Tried in order (so order is precedence): the first whose test(q, ctx) returns something truthy
  // answers, and that value (a regex match, glossary entry or topic) goes to handle(ctx, match).
  // `doc` intents answer from the checked document, so they need a report (else NEED_REPORT, or
  // their own noReport) in a language the rules can read (else the English-only notice).
  const INTENTS = [
    { name: "empty", test: (q) => !q, handle: () => ({ text: "Ask me anything about the document, for example \"Can I get a refund?\" or \"What does indemnity mean?\"." }) },
    { name: "greeting", test: (q) => /^(hi|hello|hey|namaste|help|what can you do|how do you work|who are you)\b/.test(q), handle: greet },
    // A specific clause or sentence: "clause 7", "sentence 12", "section 2.3".
    { name: "clause", doc: true, test: (q) => q.match(/\b(clause|section|sentence|point|para(?:graph)?)\s*(\d{1,3}(?:\.\d{1,2})?)\b/), handle: explainClause },
    { name: "score", doc: true, test: (q) => /\b(score|points?|rating|how (?:risky|bad)|risk level|why (?:is it|so) (?:high|low))\b/.test(q), handle: explainScore },
    { name: "should I sign", doc: true, test: (q) => /\b(should i (?:sign|agree|accept|join|buy|pay)|is (?:it|this) (?:safe|ok|okay|fair|good|legit)|can i (?:sign|trust)|safe to)\b/.test(q), handle: verdict },
    { name: "what to ask", doc: true, test: (q) => /\b(what (?:should|can) i ask|questions? to ask|negotiat\w*|what (?:should|can) i (?:say|change|request)|email|safer wording|fairer)\b/.test(q), handle: whatToAsk },
    { name: "not a risk", doc: true, test: (q) => /\b(not (?:a )?risk|skipped|ignored|safe parts|protects? me|good parts|in my favou?r)\b/.test(q), handle: protections },
    { name: "summary", doc: true, test: (q) => /\b(what is this|summar\w*|in short|overview|tl;?dr|main risks?|biggest risks?|worst|key points?)\b/.test(q), handle: summary },
    // "What is X?" or a short question naming a legal word.
    { name: "define", test: (q, c) => c.g && (/\b(what (?:is|are|does)|meaning of|define|definition|explain)\b/.test(q) || q.split(/\s+/).length <= 3) && c.g, handle: defineWord },
    { name: "topic", doc: true, test: (q, c) => pickTopic(q, c.flags), handle: topicAnswer, noReport: topicRules },
    { name: "glossary", test: (q, c) => c.g, handle: (c, g) => ({ text: g.text }) },
    // Fall back to the sentences that best match the question.
    { name: "search", doc: true, test: () => true, handle: bestMatches },
  ];

  function answer(questionRaw, report) {
    // Cut to the input's limit here too: questions can also come from code or pasted text.
    const question = String(questionRaw || "").trim().slice(0, MAX_QUESTION).trimEnd();
    const q = question.toLowerCase();
    const ctx = {
      question, report,
      flags: (report && report.flags) || [],
      o: report ? report.overall : null,
      foreign: foreignLanguage(report),
      g: glossaryHit(q),
    };
    for (const intent of INTENTS) {
      const match = intent.test(q, ctx);
      if (!match) continue;
      if (intent.doc && !report) return intent.noReport ? intent.noReport(ctx, match) : { text: NEED_REPORT };
      if (intent.doc && ctx.foreign) return { text: englishOnly(ctx.foreign) };
      return intent.handle(ctx, match);
    }
  }

  // ---- Rendering --------------------------------------------------------------------------------
  function toHtml(text) {
    return esc(text)
      .replace(/\[\[(\d+)\|([^\]]+)\]\]/g, (m, id, label) => `<a href="#" class="chip" data-goto="${id}">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
  }

  function suggestions(report) {
    // Before a check, or for a document the rules can't read (and that shows no score), only
    // word meanings make sense.
    if (!report || foreignLanguage(report)) return ["What is indemnity?", "What does arbitration mean?", "What is a notice period?"];
    const list = ["Should I sign this?", `Why is the score ${report.overall.score}?`, "What should I ask?"];
    const t = report.doc_type.type;
    list.push(t === "offer_letter" ? "Can I leave early?" : t === "quotation" ? "Are there hidden fees?" : t === "ticket" ? "Can I get a refund?" : "What happens to my data?");
    return list;
  }

  // Mounts a chat box into `el`. getReport() returns the current report (or null).
  function mount(el, getReport) {
    el.classList.add("chat");
    el.innerHTML = `
      <h3>Ask LEXGUARD</h3>
      <p class="hint">Answers come from this report and LEXGUARD's rules, inside your browser. No AI service, nothing uploaded. Not legal advice.</p>
      <div class="chat-log" aria-live="polite"></div>
      <div class="chat-suggest"></div>
      <form class="chat-form">
        <input type="text" name="q" autocomplete="off" placeholder="Ask about this document…" aria-label="Ask a question about this document" maxlength="300">
        <button type="submit" class="primary">Ask</button>
      </form>`;
    const log = el.querySelector(".chat-log");
    const sug = el.querySelector(".chat-suggest");
    const form = el.querySelector(".chat-form");
    const input = form.elements.q;

    const add = (who, html) => {
      const div = document.createElement("div");
      div.className = `msg ${who}`;
      div.innerHTML = html;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    };
    const ask = (question) => {
      if (!question.trim()) return;
      add("me", esc(question));
      add("bot", toHtml(answer(question, getReport()).text));
      input.value = "";
    };
    const refreshSuggestions = () => {
      sug.innerHTML = suggestions(getReport()).map((s) => `<button type="button" class="chip-btn">${esc(s)}</button>`).join("");
    };
    sug.addEventListener("click", (e) => { const b = e.target.closest(".chip-btn"); if (b) ask(b.textContent); });
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    refreshSuggestions();
    return { refresh: refreshSuggestions, ask, reset: () => { log.innerHTML = ""; refreshSuggestions(); } };
  }

  return { answer, mount, loadRules, setRules, toHtml, GLOSSARY };
})();

if (typeof module !== "undefined") module.exports = LexChat;
