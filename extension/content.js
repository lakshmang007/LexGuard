// Injected into the page on demand: highlights flagged sentences in place.
(() => {
  if (window.__lexguardLoaded) return;
  window.__lexguardLoaded = true;

  const CLS = { HIGH: "lexguard-high", MEDIUM: "lexguard-med", LOW: "lexguard-low" };
  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|MARK)$/;

  function clear() {
    // Merge split text back once per parent, not once per mark (a long page has hundreds).
    const parents = new Set();
    document.querySelectorAll("mark.lexguard").forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parents.add(parent);
    });
    parents.forEach((p) => p.normalize());
  }

  // A few letters (Turkish "İ") grow when lowercased; keep those as-is so offsets line up.
  // Page text and flag text must both go through this, or "İ" never matches.
  function lower(s) {
    const l = s.toLowerCase();
    if (l.length === s.length) return l;
    return Array.from(s, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join("");
  }

  // Flatten visible text with collapsed whitespace, remembering where each character came from:
  // flat[i] is offAt[i] in nodes[nodeAt[i]], or a gap between nodes when nodeAt[i] is -1.
  function textIndex() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP.test(p.tagName) || !n.nodeValue) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [], texts = [];
    let size = 0;
    for (let n; (n = walker.nextNode()); ) {
      const v = n.nodeValue;
      const low = lower(v);
      nodes.push(n);
      texts.push(low);
      size += low.length + 1;
    }
    const nodeAt = new Int32Array(size), offAt = new Int32Array(size);
    const parts = []; // joined once at the end: += per character is quadratic on big pages
    let len = 0, lastSpace = true;
    texts.forEach((v, k) => {
      const ws = /\s+/g;
      for (let i = 0, m; i < v.length; i = ws.lastIndex) {
        const end = (m = ws.exec(v)) ? m.index : v.length;
        if (end > i) {
          parts.push(v.slice(i, end));
          for (; i < end; i++) { nodeAt[len] = k; offAt[len++] = i; }
          lastSpace = false;
        }
        if (!m) break;
        if (!lastSpace) { parts.push(" "); nodeAt[len] = k; offAt[len++] = end; lastSpace = true; }
      }
      if (!lastSpace) { parts.push(" "); nodeAt[len++] = -1; lastSpace = true; }
    });
    return { flat: parts.join(""), nodes, nodeAt, offAt };
  }

  const norm = (s) => lower(s.replace(/\s+/g, " ").trim());

  function wrap(node, s, e, flag) {
    const mid = s > 0 ? node.splitText(s) : node;
    mid.splitText(e - s + 1);
    const mark = document.createElement("mark");
    mark.className = `lexguard ${CLS[flag.level]}`;
    mark.dataset.lexguardId = flag.id;
    mark.title = `LEXGUARD ${flag.level}: ${flag.risk_name}`;
    mid.parentNode.insertBefore(mark, mid);
    mark.appendChild(mid);
  }

  // Index the page once, place every flag (in priority order), then wrap. Returns missing ids.
  function highlight(flags) {
    const { flat, nodes, nodeAt, offAt } = textIndex();
    const taken = new Uint8Array(flat.length);
    const free = (i, n) => { for (let j = i; j < i + n; j++) if (taken[j]) return false; return true; };
    // First occurrence not already claimed, so a repeated sentence goes to its next copy.
    const find = (needle) => {
      for (let i = flat.indexOf(needle); i >= 0; i = flat.indexOf(needle, i + 1)) if (free(i, needle.length)) return i;
      return -1;
    };
    const hits = [], missing = [];
    for (const flag of flags) {
      let needle = norm(flag.text);
      let idx = find(needle);
      if (idx < 0 && needle.length > 60) {
        needle = needle.slice(0, 60);
        idx = find(needle);
      }
      if (idx < 0) { missing.push(flag.id); continue; }
      taken.fill(1, idx, idx + needle.length);
      hits.push({ flag, idx, end: idx + needle.length });
    }
    // Last match first: splitText keeps the start of a node in place, so the stored
    // offsets of earlier matches in the same node stay valid.
    hits.sort((a, b) => b.idx - a.idx);
    for (const { flag, idx, end } of hits) {
      const spans = new Map();
      for (let i = idx; i < end; i++) {
        const k = nodeAt[i];
        if (k < 0) continue;
        const span = spans.get(k);
        if (span) span[1] = offAt[i];
        else spans.set(k, [offAt[i], offAt[i]]);
      }
      spans.forEach(([s, e], k) => wrap(nodes[k], s, e, flag));
    }
    return missing;
  }

  function focus(id) {
    const marks = document.querySelectorAll(`mark.lexguard[data-lexguard-id="${id}"]`);
    if (!marks.length) return false;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach((m) => { m.classList.remove("lexguard-flash"); void m.offsetWidth; m.classList.add("lexguard-flash"); });
    return true;
  }

  document.addEventListener("click", (e) => {
    const mark = e.target.closest && e.target.closest("mark.lexguard");
    if (mark) chrome.runtime.sendMessage({ type: "markClicked", id: Number(mark.dataset.lexguardId) });
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "highlight") {
      clear();
      // Stable sort: HIGH, MEDIUM, LOW, then the order sent, so the first wins shared text.
      const flags = [...msg.flags].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
      const missing = highlight(flags);
      reply({ found: flags.length - missing.length, missing });
    } else if (msg.type === "focus") {
      reply({ ok: focus(msg.id) });
    } else if (msg.type === "clear") {
      clear();
      reply({ ok: true });
    }
  });
})();
