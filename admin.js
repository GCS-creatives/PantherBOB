// admin.js — Panther Bob Quiz question bank management
//
// Talks to /api/questions (the Netlify Function backed by Netlify Blobs).
// Adding a category here must also be added to VALID_CATEGORIES in
// netlify/functions/questions.js, or the server will reject it.

const CATEGORIES = [
  "True Stories & Real Missions",
  "New Places, New Faces",
  "Hidden Histories & Family Secrets",
  "Grief & Getting Through It",
  "Danger & High Stakes",
  "Myth, Magic & the Unknown",
  "Second Chances & Reinvention",
  "Sports, Skills & Standing Out",
];

let currentBank = [];
let pendingImportRows = [];

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  populateCategorySelect();
  await refreshBank();
})();

function populateCategorySelect() {
  const select = document.getElementById("q-category");
  select.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

async function refreshBank() {
  try {
    const res = await fetch("/api/questions");
    currentBank = await res.json();
  } catch (e) {
    currentBank = [];
  }
  renderBankSummary();
  renderBankTable();
}

// ---------------------------------------------------------------------
// Add single question
// ---------------------------------------------------------------------

const addForm = document.getElementById("add-question-form");
const addStatus = document.getElementById("add-status");

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = {
    category: document.getElementById("q-category").value,
    points: Number(document.getElementById("q-points").value),
    clue: document.getElementById("q-clue").value.trim(),
    answerTitle: document.getElementById("q-title").value.trim(),
    answerAuthor: document.getElementById("q-author").value.trim(),
  };

  setStatus(addStatus, "Adding…", "");
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(question),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add question.");
    setStatus(addStatus, `Added! Bank now has ${data.total} questions.`, "success");
    addForm.reset();
    await refreshBank();
  } catch (err) {
    setStatus(addStatus, `Error: ${err.message}`, "error");
  }
});

// ---------------------------------------------------------------------
// Import (CSV or JSON)
// ---------------------------------------------------------------------

const importFileInput = document.getElementById("import-file");
const importPreview = document.getElementById("import-preview");
const importPreviewTable = document.getElementById("import-preview-table");
const importStatus = document.getElementById("import-status");
const confirmImportBtn = document.getElementById("confirm-import-btn");
const cancelImportBtn = document.getElementById("cancel-import-btn");

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  setStatus(importStatus, "Reading file…", "");
  const text = await file.text();

  let rows;
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("JSON file must contain an array of question objects.");
    } else {
      rows = parseCSV(text);
    }
  } catch (err) {
    setStatus(importStatus, `Could not read file: ${err.message}`, "error");
    return;
  }

  pendingImportRows = rows.map((r) => ({
    category: (r.category || "").trim(),
    points: Number(r.points),
    clue: (r.clue || "").trim(),
    answerTitle: (r.answerTitle || "").trim(),
    answerAuthor: (r.answerAuthor || "").trim(),
  }));

  renderImportPreview();
  setStatus(importStatus, "", "");
});

function parseCSV(text) {
  // Minimal CSV parser: handles quoted fields containing commas/newlines.
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ""; });
    return obj;
  });
}

function validateRow(r) {
  const errors = [];
  if (!CATEGORIES.includes(r.category)) errors.push("unrecognized category");
  if (![100, 200, 300, 400, 500].includes(r.points)) errors.push("points must be 100-500");
  if (!r.clue) errors.push("missing clue");
  if (!r.answerTitle) errors.push("missing title");
  if (!r.answerAuthor) errors.push("missing author");
  return errors;
}

function renderImportPreview() {
  if (pendingImportRows.length === 0) {
    importPreview.classList.add("hidden");
    return;
  }
  let html = "<table><thead><tr><th>Category</th><th>Pts</th><th>Clue</th><th>Title</th><th>Author</th><th>Status</th></tr></thead><tbody>";
  pendingImportRows.forEach((r) => {
    const errors = validateRow(r);
    html += `<tr>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(String(r.points))}</td>
      <td>${escapeHtml(r.clue)}</td>
      <td>${escapeHtml(r.answerTitle)}</td>
      <td>${escapeHtml(r.answerAuthor)}</td>
      <td>${errors.length ? `<span class="row-error">${errors.join(", ")}</span>` : "OK"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  importPreviewTable.innerHTML = html;
  importPreview.classList.remove("hidden");

  const anyValid = pendingImportRows.some((r) => validateRow(r).length === 0);
  confirmImportBtn.disabled = !anyValid;
}

confirmImportBtn.addEventListener("click", async () => {
  const validRows = pendingImportRows.filter((r) => validateRow(r).length === 0);
  if (validRows.length === 0) return;

  setStatus(importStatus, "Importing…", "");
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRows),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed.");
    setStatus(importStatus, `Imported ${data.added} questions. Bank now has ${data.total}.`, "success");
    pendingImportRows = [];
    importPreview.classList.add("hidden");
    importFileInput.value = "";
    await refreshBank();
  } catch (err) {
    setStatus(importStatus, `Error: ${err.message}`, "error");
  }
});

cancelImportBtn.addEventListener("click", () => {
  pendingImportRows = [];
  importPreview.classList.add("hidden");
  importFileInput.value = "";
});

// ---------------------------------------------------------------------
// Bank browser
// ---------------------------------------------------------------------

function renderBankSummary() {
  const summaryEl = document.getElementById("bank-summary");
  const total = currentBank.length;
  const byCategory = {};
  currentBank.forEach((q) => {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
  });
  const parts = CATEGORIES.map((c) => `${c}: ${byCategory[c] || 0}`).join(" · ");
  summaryEl.textContent = `${total} questions total. ${parts}`;
}

function renderBankTable() {
  const container = document.getElementById("bank-table");
  if (currentBank.length === 0) {
    container.innerHTML = "<p>No questions yet.</p>";
    return;
  }
  let html = '<div class="bank-scroll"><table><thead><tr><th>Category</th><th>Pts</th><th>Clue</th><th>Title / Author</th><th></th></tr></thead><tbody>';
  currentBank
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category) || a.points - b.points)
    .forEach((q) => {
      html += `<tr>
        <td>${escapeHtml(q.category)}</td>
        <td>${q.points}</td>
        <td class="clue-cell">${escapeHtml(q.clue)}</td>
        <td>${escapeHtml(q.answerTitle)} — ${escapeHtml(q.answerAuthor)}</td>
        <td><button class="delete-btn" data-id="${escapeHtml(q.id)}">Delete</button></td>
      </tr>`;
    });
  html += "</tbody></table></div>";
  container.innerHTML = html;

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteQuestion(btn.dataset.id));
  });
}

async function deleteQuestion(id) {
  if (!confirm("Delete this question permanently?")) return;
  try {
    const res = await fetch("/api/questions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Delete failed.");
    await refreshBank();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = "status-msg" + (cls ? " " + cls : "");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
