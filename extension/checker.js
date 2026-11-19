// Full checker page inside the extension: paste, sample or upload (.txt / .pdf), all offline.
const $ = (id) => document.getElementById(id);
let result = null;

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

function showError(msg) {
  $("err").innerHTML = msg ? `<div class="error">${LexReport.esc(msg)}</div>` : "";
}

async function pdfText(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    // hasEOL marks line ends inside the page; keep them so clauses split the same way as pasted text.
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join(""));
  }
  return pages.join("\n\n");
}

document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", async () => {
    $("text").value = await (await fetch(`samples/${b.dataset.sample}`)).text();
    analyze();
  }));

$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  showError("");
  try {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const text = await pdfText(await file.arrayBuffer());
      if (!text.trim()) return showError("This PDF has no text layer (it looks scanned). Scanned PDFs need OCR, which this prototype does not have yet.");
      $("text").value = text;
    } else {
      $("text").value = await file.text();
    }
    analyze();
  } catch (err) {
    showError(`Could not read the file: ${err.message}`);
  }
});

async function analyze() {
  const text = $("text").value.trim();
  if (!text) return showError("Paste a document or pick a sample first.");
  showError("");
  try {
    await LexEngine.loadRules();
    result = LexEngine.analyze(text, $("doctype").value || null);
    render();
  } catch (err) {
    showError(`Could not check the document: ${err.message}`);
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
  if (e.target.closest("details")) return;
  const el = e.target.closest("mark[data-id], .card[data-id]");
  if (el) focusClause(el.dataset.id);
});

$("go").addEventListener("click", analyze);
$("minlevel").addEventListener("change", () => result && render());
$("print").addEventListener("click", () => window.print());
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
