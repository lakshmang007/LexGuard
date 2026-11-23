const $ = (id) => document.getElementById(id);
let result = null;
const chat = LexChat.mount($("chat"), () => result);
LexChat.loadRules("rules.json");
let tabId = null;

function showError(msg) {
  $("err").innerHTML = msg ? `<div class="error">${LexReport.esc(msg)}</div>` : "";
}

// The engine marks text that is mostly not in Latin letters; the rules cannot read it.
const unsupported = (r) => Boolean(r.language) && r.language.supported === false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const readPageFn = () => ({
  host: location.hostname,
  title: document.title,
  selection: String(getSelection()),
  text: document.body.innerText,
  // Only real web addresses: a page could label a javascript: link "Terms of Service".
  links: [...document.links]
    .filter((a) => /^https?:/i.test(a.href) && /terms|conditions|privacy|refund|cancell?ation|policy|agreement/i.test(a.textContent))
    .slice(0, 8)
    .map((a) => ({ text: a.textContent.trim().slice(0, 60), href: a.href })),
});

const WEB_PAGES = { origins: ["https://*/*", "http://*/*"] };

// Chrome only shows a permission prompt during the click itself, so this must be the
// first call in the button handler, before anything is awaited. Once allowed, it
// resolves straight away without asking again.
function check(mode) {
  run(mode, chrome.permissions.request(WEB_PAGES).catch(() => false));
}

async function run(mode, allowed = Promise.resolve(true)) {
  showError("");
  const granted = await allowed;
  const tab = await activeTab();
  if (!tab) return;
  tabId = tab.id;
  let page;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: readPageFn });
    page = result;
  } catch {
    return showError(granted
      ? "LEXGUARD can't read this tab. Chrome blocks extensions on its own pages (chrome://, the Web Store) and in its PDF viewer. For a PDF, use \"Paste or upload a document\" above."
      : "LEXGUARD needs your permission to read web pages. Click \"Check this page\" again and choose Allow. The text is checked inside your browser and never uploaded.");
  }
  const text = mode === "selection" ? page.selection : page.text;
  if (!text.trim()) return showError(mode === "selection" ? "Select some text on the page first." : "This page has no readable text.");

  $("links").innerHTML = mode === "page" && page.links.length
    ? `<b>Terms links on this page</b> (open one, then check it):<ul>${page.links.map((l) => `<li><a href="${LexReport.esc(l.href)}" target="_blank" rel="noopener noreferrer">${LexReport.esc(l.text || l.href)}</a></li>`).join("")}</ul>`
    : "";

  try {
    await LexEngine.loadRules();
    result = LexEngine.analyze(text, $("doctype").value || null);
    result.source = { host: page.host, title: page.title };
    let marked = null;
    if (unsupported(result)) {
      // Nothing to highlight. Remove marks left by an earlier check of this tab, if any.
      chrome.tabs.sendMessage(tabId, { type: "clear" }).catch(() => {});
    } else {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      marked = await chrome.tabs.sendMessage(tabId, { type: "highlight", flags: result.flags });
    }
    render(marked);
    chat.reset();
  } catch (err) {
    showError(`Could not check the page: ${err.message}`);
  }
}

function render(marked) {
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  $("out").hidden = false;
  $("summary").innerHTML = LexReport.summary(result);
  if (unsupported(result)) {
    // The summary shows the "English only" notice; there are no cards to list.
    $("note").textContent = "";
    $("cards").innerHTML = "";
    return;
  }
  $("note").textContent = marked && marked.missing.length
    ? `${marked.found} of ${result.flags.length} flagged sentences are highlighted on the page. The rest are listed below.`
    : "";
  const sorted = [...result.flags].sort((a, b) => order[a.level] - order[b.level] || a.id - b.id);
  const main = sorted.filter((f) => f.level !== "LOW");
  const minor = sorted.filter((f) => f.level === "LOW");
  // Minor points are folded away so long terms do not bury the serious ones.
  $("cards").innerHTML = (main.map(LexReport.card).join("") || `<p class="hint">No medium or high risks found by the rule library.</p>`)
    + (minor.length ? `<button class="show-minor" id="minor">Show ${minor.length} minor point${minor.length === 1 ? "" : "s"}</button>` : "");
  const btn = $("minor");
  if (btn) btn.addEventListener("click", () => btn.outerHTML = minor.map(LexReport.card).join(""));
}

function focusCard(id) {
  document.querySelectorAll(".card.focus").forEach((c) => c.classList.remove("focus"));
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) { card.classList.add("focus"); card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

// Mark the card here and scroll the page to its highlighted sentence.
function jumpTo(id) {
  focusCard(id);
  chrome.tabs.sendMessage(tabId, { type: "focus", id });
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-goto], .card[data-id]");
  if (!el || !tabId || (!el.dataset.goto && e.target.closest("details"))) return;
  e.preventDefault();
  jumpTo(Number(el.dataset.goto || el.dataset.id));
});

// Enter or Space on a focused card does what a click does. Keys pressed in its
// "See details" toggle or in a form control keep their usual job.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".card[data-id]");
  if (!card || !tabId || e.target.closest("details, summary, input, textarea, select, button, a[href]")) return;
  e.preventDefault(); // Space would scroll the panel
  jumpTo(Number(card.dataset.id));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "markClicked") focusCard(msg.id);
});

// The right-click menu leaves a request for the panel to pick up.
async function takePending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (pending && Date.now() - pending.at < 30000) {
    await chrome.storage.session.remove("pending");
    run(pending.mode || "selection");
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pending && changes.pending.newValue) takePending();
});

$("page").addEventListener("click", () => check("page"));
$("sel").addEventListener("click", () => check("selection"));
$("full").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("checker.html") }));
$("clear").addEventListener("click", () => tabId && chrome.tabs.sendMessage(tabId, { type: "clear" }));
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(LexReport.email(result));
  $("copy").textContent = "Copied";
  setTimeout(() => ($("copy").textContent = "Copy clarification email"), 1500);
});

takePending();
