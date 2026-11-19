// Shared report rendering for the web page and the extension side panel.
const LexReport = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LEVEL_CLASS = { HIGH: "high", MEDIUM: "med", LOW: "low" };

  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  // The first sentence of a reason is the plain-language version; the rest is legal detail.
  const plain = (reason) => reason.split(/(?<=\.)\s+/)[0];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // One entry per kind of risk, so a risk spread over two sentences is listed once.
  function groups(r) {
    const byRule = new Map();
    for (const f of [...r.flags].sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.weight - a.weight)) {
      const g = byRule.get(f.rule);
      if (!g) byRule.set(f.rule, { ...f, labels: [f.label] });
      else if (!g.labels.includes(f.label)) g.labels.push(f.label);
    }
    return [...byRule.values()];
  }

  // ---- "What is this?" overview: purpose, size and topics in plain words -----------------
  const PURPOSE = {
    offer_letter: () => "This is a job offer letter: the rules of the job you are being offered.",
    quotation: () => "This is a price quote or service agreement: what you pay, and what you get in return.",
    ticket: () => "These are ticket terms: the rules that come with your ticket.",
    policy: (site) => `These are the rules you agree to when you use ${site || "this website or app"}.`,
  };
  // Each topic: plain explanation, words that show the document covers it, and the risks that belong to it.
  const TOPICS = [
    ["Money", "how much you pay, fees and charges, and when you pay.", /\b(fees?|charges?|payments?|pricing|price|invoices?|billing|gst|taxes)\b/gi, ["hidden_fees", "price_escalation", "full_advance", "late_interest", "pay_change"]],
    ["Cancelling and refunds", "when you can cancel, and whether you get money back.", /\b(refunds?|cancel\w*|money back|renew\w*)\b/gi, ["non_refundable", "auto_renewal", "provider_cancellation", "exit_fee"]],
    ["Your account", "signing up, staying safe, and when they can block or close it.", /\b(accounts?|passwords?|log ?in|sign ?up|register\w*|suspend\w*|terminat\w*)\b/gi, ["termination_without_notice", "termination_for_convenience", "content_removal"]],
    ["Your data", "what personal information they collect and who they share it with.", /\b(personal (data|information)|privacy|cookies?|collect\w*|third part(y|ies))\b/gi, ["data_sharing"]],
    ["Your job", "your role, pay, leave and working hours.", /\b(salary|ctc|designation|leave|working hours|joining|probation)\b/gi, ["pay_change", "probation_extension", "transfer_anywhere"], "offer_letter"],
    ["Leaving", "notice period, bonds, and what happens when you quit.", /\b(notice period|resign\w*|bond|relieving|full and final|non-?compete)\b/gi, ["service_bond", "long_notice_period", "non_compete", "withhold_documents"], "offer_letter"],
    ["The work", "what will be delivered, and by when.", /\b(deliver\w*|scope of work|timelines?|milestones?|deadlines?|revisions?)\b/gi, ["delay_no_liability", "full_advance"], "quotation"],
    ["The event", "entry rules, timings, and what you can bring.", /\b(entry|venue|gates?|admission|tickets?)\b/gi, ["provider_cancellation", "non_transferable"], "ticket"],
    ["What you must not do", "the rules for using the service.", /\b(you (shall|must|may) not|prohibited|not (be )?allowed|agree not to)\b/gi, []],
    ["Who owns what", "content, logos, and the things you create or upload.", /\b(intellectual property|copyrights?|trademarks?|licen[cs]e|ownership)\b/gi, ["ip_assignment", "ip_overreach", "no_challenge"]],
    ["If something goes wrong", "how much (or how little) they are responsible for.", /\b(liab\w*|warrant\w*|indemn\w*|damages|responsib\w*)\b/gi, ["limitation_of_liability", "waiver_of_claims", "one_sided_indemnity", "delay_no_liability"]],
    ["Changes", "how and when they can change these rules or the service.", /\b(chang\w*|modif\w*|amend\w*|updat\w*)\b/gi, ["unilateral_change", "contract_by_using"]],
    ["Disputes", "which law applies, and where problems are settled.", /\b(governing law|jurisdiction|arbitrat\w*|disputes?|courts?)\b/gi, ["exclusive_jurisdiction", "mandatory_arbitration", "choice_of_law"]],
  ];
  const COMPANY = /\b([A-Z][A-Za-z0-9&'-]*(?:[ ,]+[A-Z][A-Za-z0-9&'-]*){0,4}[ ,]+(?:Private Limited|Pvt\.? Ltd\.?|Limited|Ltd\.?|Inc\.?|LLC|LLP|Corporation|Corp\.?))(?![A-Za-z])/;

  // The company a document is about is the one it names most often, not the first one it mentions.
  function mainCompany(text) {
    const counts = new Map();
    for (const m of text.slice(0, 60000).matchAll(new RegExp(COMPANY.source, "g"))) {
      const name = m[1].replace(/^(the|by|and|with|of|to|from)\s+/i, "").replace(/[,\s]+$/, "");
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    let best = null;
    for (const [name, n] of counts) if (!best || n > counts.get(best)) best = name;
    return best;
  }

  function readingTime(words) {
    const min = Math.max(1, Math.round(words / 200));
    if (min < 60) return `about ${plural(min, "minute")}`;
    const h = Math.floor(min / 60), m = min % 60;
    return `about ${plural(h, "hour")}${m ? ` ${plural(m, "minute")}` : ""}`;
  }

  function overview(r) {
    const site = r.source && r.source.host ? r.source.host.replace(/^www\./, "") : "";
    const type = PURPOSE[r.doc_type.type] ? r.doc_type.type : "policy";
    const company = mainCompany(r.text);
    const words = r.text.split(/\s+/).filter(Boolean).length;
    const kindLevel = Object.fromEntries(r.overall.breakdown.map((k) => [k.rule, k.level]));
    const topics = TOPICS
      .filter((t) => !t[4] || t[4] === r.doc_type.type)
      .map(([name, plainText, re, rules]) => {
        const n = (r.text.match(re) || []).length;
        const risks = rules.filter((id) => kindLevel[id]);
        const worst = risks.reduce((w, id) => (ORDER[kindLevel[id]] < ORDER[w] ? kindLevel[id] : w), "LOW");
        return { name, plainText, n, risks: risks.length, worst };
      })
      .filter((t) => t.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const items = topics.map((t) => {
      const badge = t.risks
        ? `<span class="badge ${LEVEL_CLASS[t.worst]}">${t.worst === "LOW" ? "minor" : plural(t.risks, "risk")}</span>`
        : `<span class="badge ok">looks OK</span>`;
      return `<li><span><b>${esc(t.name)}</b>: ${esc(t.plainText)}</span>${badge}</li>`;
    }).join("");
    return `
      <div class="topq overview">
        <h3>What is this?</h3>
        <p class="purpose">${esc(PURPOSE[type](site))}${company ? ` It is between you and <b>${esc(company)}</b>${company.endsWith(".") ? "" : "."}` : ""}</p>
        <p class="hint">${words.toLocaleString("en-IN")} words · ${readingTime(words)} to read · LEXGUARD read it in ${r.elapsed_ms < 1000 ? `${Math.max(1, Math.round(r.elapsed_ms))} ms` : `${(r.elapsed_ms / 1000).toFixed(1)} s`}</p>
        ${items ? `<p class="sub">What it covers, in simple words:</p><ul class="topics">${items}</ul>` : ""}
      </div>`;
  }

  // ---- How the score was worked out ------------------------------------------------------
  function scoreDetails(r) {
    const o = r.overall;
    const pts = o.level_points;
    const rows = o.breakdown.map((k) =>
      `<tr><td><span class="dot ${LEVEL_CLASS[k.level]}"></span>${esc(k.name)}</td><td>${k.level}</td><td>${k.sentences}</td><td>+${k.points}</td></tr>`).join("");
    const parts = ["HIGH", "MEDIUM", "LOW"].filter((l) => o.kind_counts[l]).map((l) => `${o.kind_counts[l]} ${l.toLowerCase()} × ${pts[l]}`);
    return `
      <details class="how-score">
        <summary>How was this score worked out?</summary>
        <p>Each <b>kind</b> of risk counts once, however many sentences repeat it, so long documents are not punished for being long. Serious kinds add ${pts.HIGH} points, medium kinds ${pts.MEDIUM}, minor kinds ${pts.LOW}.</p>
        ${rows ? `<table class="breakdown"><thead><tr><th>Kind of risk</th><th>Level</th><th>Sentences</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
        <p><b>Total: ${parts.join(" + ") || "0"} = ${o.points} points${o.points > 100 ? ", capped at 100" : ""}.</b> 50 or more is HIGH risk, 20 to 49 is MEDIUM, under 20 is LOW.</p>
        <p class="hint">A sentence's level comes from its rule's weight, lowered by the Defender when it finds a protection elsewhere in the document (${plural(o.defended, "sentence")} lowered here).</p>
      </details>`;
  }

  // ---- What LEXGUARD did -----------------------------------------------------------------
  function steps(r) {
    const o = r.overall;
    const kinds = o.breakdown.length;
    return `
      <div class="topq steps">
        <h3>How LEXGUARD checked this</h3>
        <ol class="agents">
          <li><span><b>Extractor</b> split the text into ${plural(r.clause_count, "sentence")} and clauses, keeping the exact words.</span></li>
          <li><span><b>Risk Finder</b> compared each one with the ${r.rules_checked} kinds of risky wording that apply to this kind of document, and flagged ${plural(r.flags.length, "sentence")} (${plural(kinds, "kind")} of risk).</span></li>
          <li><span><b>Defender</b> searched the whole document for protections, like a refund window or written notice, and lowered the risk of ${plural(o.defended, "sentence")}. It also checked <b>who each sentence affects</b>: it removed ${plural(o.skipped || 0, "sentence")} that only give you a right or are a promise to you${o.both_sides ? `, and lowered ${plural(o.both_sides, "rule")} that bind both sides` : ""}.</span></li>
          <li><span><b>Judge</b> gave each sentence LOW, MEDIUM or HIGH, and added up the points per kind: <b>${o.score}/100</b>.</span></li>
        </ol>
        ${skippedList(o)}
        <p class="hint">Everything ran inside your browser using fixed rules. No AI service was used and nothing was uploaded.</p>
      </div>`;
  }

  // Sentences with risky-looking words that the Defender found are not a risk for the reader.
  function skippedList(o) {
    const items = (o.skipped_examples || []).map((s) =>
      `<li><q>${esc(s.text.length > 180 ? `${s.text.slice(0, 180)}…` : s.text)}</q> <span class="hint">(${esc(s.label)})</span><br><span class="why-not">${esc(s.reason)}</span></li>`).join("");
    if (!items) return "";
    return `
        <details class="not-risks">
          <summary>Not a risk for you (${o.skipped})</summary>
          <p class="hint">These sentences use risky-sounding words, but they protect you or describe your own choices, so they are not counted.</p>
          <ul>${items}</ul>
          ${o.skipped > 5 ? `<p class="hint">Showing 5 of ${o.skipped}.</p>` : ""}
        </details>`;
  }

  function verdict(r) {
    const { HIGH, MEDIUM } = r.overall.kind_counts;
    const [doc, has] = {
      offer_letter: ["This offer letter", "has"],
      quotation: ["This quote", "has"],
      ticket: ["These ticket terms", "have"],
    }[r.doc_type.type] || ["These terms", "have"];
    const act = r.doc_type.type === "policy" ? "agree" : "sign";
    if (HIGH) return `${doc} ${has} ${plural(HIGH, "serious kind")} of risk${MEDIUM ? ` and ${MEDIUM} more worth checking` : ""}. Don't ${act} until you've asked about them.`;
    if (MEDIUM) return `${doc} ${has} ${plural(MEDIUM, "point")} worth checking before you ${act}.`;
    return `No serious risks found in ${doc.toLowerCase()}. Still read it: LEXGUARD only knows the patterns in its rule library.`;
  }

  function summary(r) {
    const o = r.overall;
    const main = groups(r).filter((g) => g.level !== "LOW");
    const shown = main.slice(0, 5);
    const points = shown.map((g) =>
      `<li><span class="dot ${LEVEL_CLASS[g.level]}"></span><span><a href="#" data-goto="${g.id}">${esc(g.risk_name)}</a>: ${esc(plain(g.reason))} <span class="hint">(${esc(g.labels.slice(0, 3).join(", "))}${g.labels.length > 3 ? ` and ${g.labels.length - 3} more` : ""})</span></span></li>`).join("");
    const more = main.length > shown.length ? `<p class="hint">${main.length - shown.length} more below.</p>` : "";
    const qs = o.top_questions.map((q) => `<li>${esc(q.question)} <a href="#" data-goto="${q.clause_id}">(${esc(q.label)})</a></li>`).join("");
    return `
      <div class="summary">
        <div class="score ${LEVEL_CLASS[o.level]}" style="--p:${o.score}" data-score="${o.score}" role="img" aria-label="Risk score ${o.score} out of 100, ${o.level.toLowerCase()} risk"><span class="num">${o.score}</span><span class="of">/100</span><span class="lvl">${o.level} risk</span></div>
        <div class="meta">
          <div class="verdict">${esc(verdict(r))}</div>
          <div class="ai-note">${esc(r.doc_type.label)} · ${r.clause_count} sentences checked · offline rules only</div>
          ${scoreDetails(r)}
        </div>
      </div>
      ${overview(r)}
      ${points ? `<div class="topq"><h3>Risks, in short</h3><ul class="points">${points}</ul>${more}</div>` : ""}
      ${qs ? `<div class="topq"><h3>Ask before signing</h3><ol>${qs}</ol></div>` : ""}
      ${steps(r)}`;
  }

  function card(f) {
    const also = f.also.length ? `<div class="also">Also matches: ${f.also.map((a) => esc(a.name)).join(", ")}</div>` : "";
    const india = f.jurisdiction === "IN" ? `<span class="tag">India rule</span>` : "";
    return `
      <article class="card ${LEVEL_CLASS[f.level]}" data-id="${f.id}" tabindex="0">
        <header><span class="badge ${LEVEL_CLASS[f.level]}">${f.level}</span><span class="cname">${esc(f.risk_name)}</span><span class="clabel">${esc(f.label)}</span>${india}</header>
        <p class="gist">${esc(plain(f.reason))}</p>
        <p class="ask"><b>Ask:</b> ${esc(f.question)}</p>
        <details>
          <summary>See details</summary>
          <dl>
            <dt>The sentence</dt><dd><blockquote>${esc(f.text)}</blockquote></dd>
            <dt>Why it matters</dt><dd>${esc(f.reason)}</dd>
            <dt>Protections checked</dt><dd class="${f.defended ? "defended" : ""}">${esc(f.defender)}</dd>
            <dt>Ask for this wording</dt><dd class="safer">${esc(f.safer_wording)}</dd>
          </dl>
          ${also}
        </details>
      </article>`;
  }

  function highlighted(r, minLevel) {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const flags = r.flags.filter((f) => order[f.level] >= order[minLevel]).sort((a, b) => a.start - b.start);
    let html = "", pos = 0;
    for (const f of flags) {
      html += esc(r.text.slice(pos, f.start));
      html += `<mark class="${LEVEL_CLASS[f.level]}" data-id="${f.id}" title="${f.level}: ${esc(f.risk_name)}">${esc(r.text.slice(f.start, f.end))}</mark>`;
      pos = f.end;
    }
    return html + esc(r.text.slice(pos));
  }

  function email(r) {
    const items = r.flags.filter((f) => f.level !== "LOW").sort((a, b) => b.weight - a.weight);
    const lines = items.map((f, i) => `${i + 1}. ${f.label}: "${f.text.replace(/\s+/g, " ")}"\n   ${f.question}\n   Suggested wording: ${f.safer_wording}`);
    return `Subject: Clarifications before I sign\n\nHello,\n\nThank you for sharing the document. Before signing, I would like to clarify the following points:\n\n${lines.join("\n\n")}\n\nI look forward to your reply.\n\nRegards,\n`;
  }

  return { esc, summary, card, highlighted, email };
})();
