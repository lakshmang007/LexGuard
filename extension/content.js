// Injected into the page on demand: highlights flagged sentences in place.
(() => {
  if (window.__lexguardLoaded) return;
  window.__lexguardLoaded = true;

  const CLS = { HIGH: "lexguard-high", MEDIUM: "lexguard-med", LOW: "lexguard-low" };
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|MARK)$/;

  function clear() {
    document.querySelectorAll("mark.lexguard").forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  // Flatten visible text with collapsed whitespace, remembering where each character came from.
  function textIndex() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP.test(p.tagName) || !n.nodeValue) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let flat = "";
    const map = [];
    let lastSpace = true;
    for (let n; (n = walker.nextNode()); ) {
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        if (/\s/.test(v[i])) {
          if (lastSpace) continue;
          flat += " "; map.push([n, i]); lastSpace = true;
        } else {
          flat += v[i].toLowerCase(); map.push([n, i]); lastSpace = false;
        }
      }
      if (!lastSpace) { flat += " "; map.push(null); lastSpace = true; }
    }
    return { flat, map };
  }

  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

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

  function highlight(flag) {
    const { flat, map } = textIndex();
    let needle = norm(flag.text);
    let idx = flat.indexOf(needle);
    if (idx < 0 && needle.length > 60) {
      needle = needle.slice(0, 60);
      idx = flat.indexOf(needle);
    }
    if (idx < 0) return false;
    const spans = new Map();
    for (let i = idx; i < idx + needle.length; i++) {
      const at = map[i];
      if (!at) continue;
      const [node, off] = at;
      const span = spans.get(node) || [off, off];
      spans.set(node, [Math.min(span[0], off), Math.max(span[1], off)]);
    }
    spans.forEach(([s, e], node) => wrap(node, s, e, flag));
    return true;
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
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const flags = [...msg.flags].sort((a, b) => order[a.level] - order[b.level]);
      const missing = flags.filter((f) => !highlight(f)).map((f) => f.id);
      reply({ found: flags.length - missing.length, missing });
    } else if (msg.type === "focus") {
      reply({ ok: focus(msg.id) });
    } else if (msg.type === "clear") {
      clear();
      reply({ ok: true });
    }
  });
})();
