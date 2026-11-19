const $ = (id) => document.getElementById(id);
let result = null;

function showError(msg) {
  $("err").innerHTML = msg ? `<div class="error">${LexReport.esc(msg)}</div>` : "";
}

async function loadSamples() {
  try {
    const names = await (await fetch("/samples")).json();
    $("samples").innerHTML = names.map((n) => `<button data-sample="${n}">${n.replace(".txt", "").replace(/_/g, " ")}</button>`).join(" ");
  } catch { /* samples are optional */ }
}

$("samples").addEventListener("click", async (e) => {
  const name = e.target.dataset.sample;
  if (!name) return;
  $("text").value = await (await fetch(`/samples/${name}`)).text();
  analyze();
});

$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showError("");
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const res = await fetch("/extract", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: await file.arrayBuffer() });
    const data = await res.json();
    if (!res.ok) return showError(data.error);
    $("text").value = data.text;
  } else {
    $("text").value = await file.text();
  }
  e.target.value = "";
  analyze();
});

async function analyze() {
  const text = $("text").value.trim();
  if (!text) return showError("Paste a document or pick a sample first.");
  showError("");
  $("go").disabled = true;
  $("go").textContent = "Checking…";
  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, doc_type: $("doctype").value || null, use_ai: $("ai").checked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    result = data;
    render();
  } catch (err) {
    showError(`Could not check the document: ${err.message}`);
  } finally {
    $("go").disabled = false;
    $("go").textContent = "Check document";
  }
}

function render() {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const min = $("minlevel").value;
  $("out").hidden = false;
  $("summary").innerHTML = LexReport.summary(result);
  $("doc").innerHTML = LexReport.highlighted(result, min);
  const flags = result.flags.filter((f) => order[f.level] >= order[min]).sort((a, b) => order[b.level] - order[a.level] || a.id - b.id);
  $("cards").innerHTML = flags.map(LexReport.card).join("") || `<p class="hint">No flags at this level.</p>`;
  $("summary").scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusClause(id) {
  document.querySelectorAll(".focus").forEach((el) => el.classList.remove("focus"));
  const mark = document.querySelector(`mark[data-id="${id}"]`);
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (mark) { mark.classList.add("focus"); mark.scrollIntoView({ behavior: "smooth", block: "center" }); }
  if (card) { card.classList.add("focus"); card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) { e.preventDefault(); return focusClause(goto.dataset.goto); }
  if (e.target.closest("details")) return; // opening details should not scroll the page
  const el = e.target.closest("mark[data-id], .card[data-id]");
  if (el) focusClause(el.dataset.id);
});

$("go").addEventListener("click", analyze);
$("minlevel").addEventListener("change", () => result && render());
$("print").addEventListener("click", () => window.print());
// The printed report should include every card's details.
window.addEventListener("beforeprint", () => document.querySelectorAll(".card details").forEach((d) => (d.open = true)));
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(LexReport.email(result));
    $("copy").textContent = "Copied";
  } catch {
    $("copy").textContent = "Copy failed";
  }
  setTimeout(() => ($("copy").textContent = "Copy clarification email"), 1500);
});

loadSamples();
