// LEXGUARD engine for the browser: Extractor -> Risk Finder -> Defender -> Judge.
// A line-for-line port of the Python engine in ../engine, using the same rules.json,
// so the extension works with no server. eval/parity_check.js checks both give the same flags.
const LexEngine = (() => {
  // ---- Extractor -------------------------------------------------------------------------
  const ABBREVIATIONS = new Set([
    "rs", "no", "nos", "e.g", "i.e", "etc", "mr", "mrs", "ms", "dr", "st", "vs",
    "pvt", "ltd", "co", "inc", "approx", "dept", "sec", "s", "art", "cl", "p.a",
    "a.m", "p.m", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept",
    "oct", "nov", "dec", "fig", "max", "min", "govt", "u.s",
  ]);
  const PARAGRAPH = /[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*/g;
  const LIST_START = /\n(?=[ \t]*(?:\d{1,2}(?:\.\d{1,2})*[.)]\s|\([a-zA-Z0-9]{1,3}\)\s|[-*•]\s|[A-Z][A-Z &]{3,}\n))/g;
  const SENTENCE_END = /[.!?;](?=["'”’)]?\s+["'“(]?[A-Z0-9])/g;
  const NUMBER_PREFIX = /^\s*(?:clause\s+)?(\d{1,2}(?:\.\d{1,2})*)[.)]\s/i;
  const isSpace = (ch) => /\s/.test(ch);

  function isAbbreviation(text, dot) {
    const m = /([A-Za-z.]+)$/.exec(text.slice(0, dot));
    if (!m) return dot > 0 && /\d/.test(text[dot - 1]);
    const word = m[1].toLowerCase().replace(/^\.+|\.+$/g, "");
    return ABBREVIATIONS.has(word) || word.length === 1;
  }

  function headingCuts(para) {
    const cuts = [];
    let pos = 0;
    for (const line of para.split("\n").slice(0, -1)) {
      pos += line.length + 1;
      const s = line.trim();
      if (s && !".;:,".includes(s[s.length - 1]) && s.split(/\s+/).length <= 8) cuts.push(pos - 1);
    }
    return cuts;
  }

  function* blocks(text) {
    for (const para of text.matchAll(PARAGRAPH)) {
      const p = para[0];
      const cuts = new Set([...p.matchAll(LIST_START)].map((m) => m.index));
      headingCuts(p).forEach((c) => cuts.add(c));
      const bounds = [0, ...[...cuts].sort((a, b) => a - b), p.length];
      for (let i = 0; i < bounds.length - 1; i++) yield [para.index + bounds[i], para.index + bounds[i + 1]];
    }
  }

  function* sentences(text, start, end) {
    const chunk = text.slice(start, end);
    let last = 0;
    for (const m of chunk.matchAll(SENTENCE_END)) {
      if (chunk[m.index] === "." && isAbbreviation(chunk, m.index)) continue;
      yield [start + last, start + m.index + 1];
      last = m.index + 1;
    }
    yield [start + last, end];
  }

  function extract(text) {
    const clauses = [];
    let section = null;
    for (const [bs, be] of blocks(text)) {
      for (let [a, b] of sentences(text, bs, be)) {
        while (a < b && isSpace(text[a])) a++;
        while (b > a && isSpace(text[b - 1])) b--;
        if (a >= b) continue;
        const piece = text.slice(a, b);
        const num = NUMBER_PREFIX.exec(piece);
        if (num) section = num[1];
        if ((piece.match(/[A-Za-z]{2,}/g) || []).length < 4) continue;
        clauses.push({ id: clauses.length + 1, text: piece, start: a, end: b, section });
      }
    }
    return clauses;
  }

  // ---- Document type ---------------------------------------------------------------------
  const SIGNALS = {
    offer_letter: ["offer letter", "offer of employment", "date of joining", "joining", "ctc", "designation", "probation", "notice period", "employee", "salary", "appointment", "human resources", "hr "],
    quotation: ["quotation", "quote", "estimate", "invoice", "scope of work", "deliverables", "advance", "client", "gst", "payment terms", "proposal", "milestone"],
    ticket: ["ticket", "event", "venue", "admission", "booking", "attendee", "entry", "concert", "show", "seat", "organiser", "organizer", "box office"],
    policy: ["terms of service", "terms of use", "privacy policy", "subscription", "account", "user", "website", "app", "cookies", "personal data", "platform"],
  };
  const LABELS = {
    offer_letter: "Offer letter",
    quotation: "Quotation / service agreement",
    ticket: "Ticket terms",
    policy: "Online policy / subscription",
  };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function detect(text) {
    const lower = text.toLowerCase();
    const scores = {};
    for (const [t, kws] of Object.entries(SIGNALS)) {
      scores[t] = kws.reduce((n, k) => n + (lower.match(new RegExp(`\\b${escRe(k.trim())}\\b`, "g")) || []).length, 0);
    }
    let best = "offer_letter";
    for (const t of Object.keys(scores)) if (scores[t] > scores[best]) best = t;
    const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
    if (scores[best] === 0) best = "policy";
    return { type: best, label: LABELS[best], confidence: round(scores[best] / total), scores };
  }

  // ---- Rules -----------------------------------------------------------------------------
  const round = (x, d = 2) => Math.round(x * 10 ** d + Number.EPSILON) / 10 ** d;
  const rx = (p) => new RegExp(p, "i");

  function compileRules(rules) {
    for (const r of rules.risks) {
      r._re = r.patterns.map(rx);
      r._boost = (r.boost_patterns || []).map(rx);
      r._exclude = (r.exclude_patterns || []).map(rx);
      r._topic = r.topic ? rx(r.topic) : null;
    }
    for (const p of rules.protections) p._re = p.patterns.map(rx);
    return rules;
  }

  const applies = (rule, docType) => {
    const types = rule.doc_types || ["all"];
    return docType === "any" || types.includes("all") || types.includes(docType);
  };

  // ---- Agent 2: Risk Finder --------------------------------------------------------------
  function findRisks(clauses, rules, docType) {
    const active = rules.risks.filter((r) => applies(r, docType));
    for (const clause of clauses) {
      let hits = [];
      for (const rule of active) {
        let match = null;
        for (const re of rule._re) if ((match = re.exec(clause.text))) break;
        // Exclusions catch rights that belong to the reader ("you may cancel at any time").
        if (!match || rule._exclude.some((x) => x.test(clause.text))) continue;
        let weight = rule.weight;
        if (rule._boost.some((b) => b.test(clause.text))) weight = Math.min(1, weight + 0.1);
        hits.push({ rule: rule.id, name: rule.name, weight: round(weight), matched: match[0], jurisdiction: rule.jurisdiction || null });
      }
      // A more specific rule (pay_change) makes the generic one redundant.
      if (hits.some((h) => h.rule === "pay_change")) hits = hits.filter((h) => h.rule !== "unilateral_change");
      clause.risks = hits.sort((a, b) => b.weight - a.weight);
    }
  }

  // ---- Agent 3: Defender -----------------------------------------------------------------
  const label = (c) => (c.section ? `clause ${c.section}` : `sentence ${c.id}`);

  function findProtection(prot, clause, clauses, topic) {
    for (const re of prot._re) { const m = re.exec(clause.text); if (m) return [clause, m[0]]; }
    for (const other of clauses) {
      if (other === clause || (topic && !topic.test(other.text))) continue;
      for (const re of prot._re) { const m = re.exec(other.text); if (m) return [other, m[0]]; }
    }
    return null;
  }

  function defend(clauses, rules) {
    const risks = Object.fromEntries(rules.risks.map((r) => [r.id, r]));
    const prots = Object.fromEntries(rules.protections.map((p) => [p.id, p]));
    for (const clause of clauses) {
      for (const hit of clause.risks) {
        const rule = risks[hit.rule];
        hit.defended_by = [];
        const lookedFor = [];
        let weight = hit.weight;
        for (const pid of rule.protections || []) {
          const prot = prots[pid];
          lookedFor.push(prot.name.toLowerCase());
          const found = findProtection(prot, clause, clauses, rule._topic);
          if (found) {
            weight -= prot.reduces;
            hit.defended_by.push({ protection: pid, name: prot.name, clause_id: found[0].id, clause_label: label(found[0]), matched: found[1] });
          }
        }
        hit.final_weight = round(Math.max(0.05, weight));
        if (hit.defended_by.length) {
          hit.defender_note = "Risk reduced: " + hit.defended_by.map((d) => `${d.name} found in ${d.clause_label} ("${d.matched}")`).join("; ") + ".";
        } else if (lookedFor.length) {
          hit.defender_note = `No protection found elsewhere (looked for: ${lookedFor.join(", ")}), so the risk stays.`;
        } else {
          hit.defender_note = "No standard protection exists for this risk; check it carefully.";
        }
      }
    }
  }

  // ---- Agent 3, part 2: who does this sentence affect? -------------------------------------
  // Mirrors engine/impact.py: drops rights and promises that protect the reader, lowers rules
  // that bind both sides, keeps everything that lands on the reader.
  const USER_P = "you|yourself|the user|the employee|the client|the merchant|the subscriber|the attendee|the buyer|the member|the candidate";
  const COMPANY_P = "we|us|the company|the provider|the service provider|the platform|the organi[sz]er|the employer|the vendor|the licensor";
  const MUTUAL_P = "either party|each party|both parties|the parties|either of the parties|mutually";
  const PARTY = new RegExp(String.raw`\b(?:(?<mutual>${MUTUAL_P})|(?<user>${USER_P})|(?<company>${COMPANY_P}))\b`, "gi");
  const USER_RIGHT = /[\s,]*(?:\w+[\s,]+){0,2}?(?:may|can|could|are (?:free|entitled|allowed) to|have the right to|shall have the right to|choose to|opt)\b(?![\s,]+(?:also[\s,]+|still[\s,]+)?be\b)/iy;
  const PROMISE = new RegExp(String.raw`\b(?:${COMPANY_P})\b[^.;]{0,30}?\b(?:(?:will|shall|do|does|would|can|may)(?:\s+not|n['’]t)|never|no longer)\b[^.;]{0,40}?\b(?:sell|rent|share|disclose|delete|remove|screen|monitor|charge|increase|change|modify|renew|transfer|terminate|suspend|use)\w*\b`, "gi");
  const EXCEPTION = /\b(?:except|unless|other than|however|but)\b/i;
  const YOU_NOT_LIABLE = /\byou\s+(?:will|shall|would|are)\s+not\s+be\s+(?:held\s+)?(?:liable|responsible)\b/gi;
  const POWER_RULES = new Set(["unilateral_change", "termination_without_notice", "termination_for_convenience", "content_removal",
    "provider_cancellation", "data_sharing", "price_escalation", "hidden_fees", "auto_renewal", "pay_change", "transfer_anywhere"]);
  const PROMISE_RULES = new Set(["data_sharing", "content_removal", "hidden_fees", "auto_renewal", "unilateral_change",
    "price_escalation", "termination_without_notice", "termination_for_convenience"]);
  const LIABILITY_RULES = new Set(["limitation_of_liability", "delay_no_liability"]);
  const MUTUAL_RULES = new Set([...POWER_RULES, "limitation_of_liability", "exit_fee"]);
  const MUTUAL_REDUCES = 0.2;

  function actorBefore(text, pos) {
    let last = null;
    for (const m of text.slice(0, pos).matchAll(PARTY)) last = m;
    if (!last) return [null, null];
    const kind = Object.keys(last.groups).find((g) => last.groups[g] !== undefined);
    return [kind, last];
  }

  function assess(text, ruleId, matchStart) {
    if (PROMISE_RULES.has(ruleId)) {
      for (const p of text.matchAll(PROMISE)) {
        const end = p.index + p[0].length;
        if (p.index <= matchStart && matchStart <= end + 80 && !EXCEPTION.test(text.slice(p.index, Math.max(end, matchStart)))) {
          return ["not_you", "A promise the company makes to you, not a risk for you."];
        }
      }
    }
    const [kind, actor] = actorBefore(text, matchStart + 1);
    const actorEnd = actor ? actor.index + actor[0].length : 0;
    if (kind === "user" && POWER_RULES.has(ruleId)) {
      USER_RIGHT.lastIndex = actorEnd;
      if (USER_RIGHT.test(text)) return ["not_you", "This is something you can choose to do, not something done to you."];
    }
    if (LIABILITY_RULES.has(ruleId)) {
      for (const m of text.matchAll(YOU_NOT_LIABLE)) {
        if (m.index <= matchStart && matchStart <= m.index + m[0].length) return ["not_you", "This limits your liability, which protects you."];
      }
    }
    // "Either party may ..." only counts when both parties are the ones acting, not "the parties agree that X may ...".
    const between = actor ? text.slice(actorEnd, matchStart) : "";
    if (kind === "mutual" && MUTUAL_RULES.has(ruleId) && between.length <= 25 && !/\b(?:that|which|whereby)\b/i.test(between)) {
      return ["both", "Applies to both sides, so it is fairer."];
    }
    return ["you", ""];
  }

  function checkImpact(clauses) {
    for (const clause of clauses) {
      const kept = [], skipped = [];
      for (const hit of clause.risks) {
        const start = clause.text.indexOf(hit.matched);
        const [impact, note] = assess(clause.text, hit.rule, Math.max(start, 0));
        hit.impact = impact;
        if (impact === "not_you") { skipped.push({ rule: hit.rule, name: hit.name, reason: note }); continue; }
        if (impact === "both") {
          hit.final_weight = round(Math.max(0.05, hit.final_weight - MUTUAL_REDUCES));
          hit.defender_note += " " + note;
        }
        kept.push(hit);
      }
      clause.risks = kept;
      clause.skipped = skipped;
    }
  }

  // ---- Agent 4: Judge --------------------------------------------------------------------
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const LEVEL_POINTS = { HIGH: 15, MEDIUM: 5, LOW: 1 };
  const SCORE_LEVELS = { HIGH: 50, MEDIUM: 20 };
  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  function judge(clauses, rules) {
    const risks = Object.fromEntries(rules.risks.map((r) => [r.id, r]));
    const t = rules.levels;
    const level = (w) => (w >= t.HIGH ? "HIGH" : w >= t.MEDIUM ? "MEDIUM" : "LOW");
    const flags = [];
    for (const clause of clauses) {
      const hits = clause.risks;
      if (!hits.length) continue;
      hits.sort((a, b) => b.final_weight - a.final_weight);
      const top = hits[0];
      // Several independent risks in one clause push it up a little.
      const weight = Math.min(1, top.final_weight + 0.05 * (hits.length - 1));
      const rule = risks[top.rule];
      flags.push({
        id: clause.id, section: clause.section, label: capitalize(label(clause)),
        text: clause.text, start: clause.start, end: clause.end,
        level: level(weight), weight: round(weight),
        rule: top.rule, risk_name: top.name, matched: top.matched,
        reason: rule.reason, defender: top.defender_note, defended: top.defended_by.length > 0,
        question: rule.question, safer_wording: rule.safer_wording, jurisdiction: top.jurisdiction,
        also: hits.slice(1).map((h) => ({ rule: h.rule, name: h.name })),
        impact: top.impact,
        source: "rules",
      });
    }
    // Sentences the Defender found are not a risk for the reader (a right or a promise to them).
    const skipped = clauses.filter((c) => c.skipped && c.skipped.length && !c.risks.length).map((c) => ({
      id: c.id, label: capitalize(label(c)), text: c.text, name: c.skipped[0].name, reason: c.skipped[0].reason,
    }));
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    flags.forEach((f) => counts[f.level]++);

    // Risk score: every *kind* of risk counts once, however many sentences repeat it, so a
    // long document is not punished for its length. Points per kind follow its worst sentence.
    const kinds = new Map();
    for (const f of flags) {
      if (!kinds.has(f.rule)) kinds.set(f.rule, { rule: f.rule, name: f.risk_name, level: f.level, sentences: 0, defended: 0, first_id: f.id });
      const k = kinds.get(f.rule);
      k.sentences += 1;
      k.defended += f.defended ? 1 : 0;
      if (ORDER[f.level] < ORDER[k.level]) k.level = f.level;
    }
    const breakdown = [...kinds.values()].sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.sentences - a.sentences);
    breakdown.forEach((k) => (k.points = LEVEL_POINTS[k.level]));
    const points = breakdown.reduce((s, k) => s + k.points, 0);
    const score = Math.min(100, points);
    const overall = score >= SCORE_LEVELS.HIGH ? "HIGH" : score >= SCORE_LEVELS.MEDIUM ? "MEDIUM" : "LOW";
    const kindCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    breakdown.forEach((k) => kindCounts[k.level]++);
    const topQuestions = [];
    const seen = new Set();
    for (const f of [...flags].sort((a, b) => b.weight - a.weight)) {
      if (!seen.has(f.question) && f.level !== "LOW") {
        seen.add(f.question);
        topQuestions.push({ clause_id: f.id, label: f.label, question: f.question });
      }
      if (topQuestions.length === 3) break;
    }
    return [flags, {
      score, level: overall, counts, top_questions: topQuestions,
      breakdown, points, kind_counts: kindCounts, level_points: LEVEL_POINTS,
      defended: flags.filter((f) => f.defended).length,
      both_sides: flags.filter((f) => f.impact === "both").length,
      skipped: skipped.length,
      skipped_examples: skipped.slice(0, 5),
    }];
  }

  // ---- Pipeline --------------------------------------------------------------------------
  let rules = null;

  function setRules(raw) {
    rules = compileRules(JSON.parse(JSON.stringify(raw)));
  }

  async function loadRules(url = "rules.json") {
    if (!rules) setRules(await (await fetch(url)).json());
    return rules;
  }

  function clean(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/ /g, " ").replace(/(?<=[a-z,])\n(?=[a-z])/g, " ");
  }

  function analyze(text, docType = null) {
    if (!rules) throw new Error("Rules not loaded");
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    text = clean(text);
    let detected = detect(text);
    if (LABELS[docType]) detected = { ...detected, type: docType, label: LABELS[docType], confidence: 1 };
    else if (docType === "any") detected = { ...detected, type: "any", label: "All rule packs", confidence: 1 };
    const clauses = extract(text);
    findRisks(clauses, rules, detected.type);
    defend(clauses, rules);
    checkImpact(clauses);
    const [flags, overall] = judge(clauses, rules);
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      text, doc_type: detected, clause_count: clauses.length, overall, flags,
      rules_checked: rules.risks.filter((r) => applies(r, detected.type)).length,
      ai_layer: { used: false, note: "Runs inside your browser using the offline rule library. Nothing is uploaded." },
      elapsed_ms: round(t1 - t0, 1),
      disclaimer: "LEXGUARD is a review aid, not legal advice.",
    };
  }

  return { loadRules, setRules, analyze, LABELS };
})();

if (typeof module !== "undefined") module.exports = LexEngine;
