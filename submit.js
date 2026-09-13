// submit.js — student BOB question submission form

let ALL_BOOKS = [];

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

function populateBookSelect(books) {
  const select = document.getElementById("sq-book");
  select.innerHTML = books
    .map((b) => `<option value="${escapeAttr(b.title)}">${escapeHtml(b.title)}</option>`)
    .join("");
}

function getSelectedBook() {
  const title = document.getElementById("sq-book").value;
  return ALL_BOOKS.find((b) => b.title === title);
}

function updatePreview() {
  const middle = document.getElementById("sq-question").value.trim().replace(/\?+$/, "");
  const page = document.getElementById("sq-page").value.trim();
  const preview = document.getElementById("submit-preview");
  const previewText = document.getElementById("submit-preview-text");

  if (!middle) {
    preview.classList.add("hidden");
    return;
  }
  previewText.textContent = `In which book ${middle}?${page ? ` (p. ${page})` : ""}`;
  preview.classList.remove("hidden");
}

document.getElementById("sq-question").addEventListener("input", updatePreview);
document.getElementById("sq-page").addEventListener("input", updatePreview);

document.getElementById("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("submit-status");
  const book = getSelectedBook();
  const payload = {
    studentName: document.getElementById("sq-name").value.trim(),
    bookTitle: book.title,
    bookAuthor: book.author,
    questionMiddle: document.getElementById("sq-question").value.trim(),
    pageNumber: document.getElementById("sq-page").value.trim(),
  };

  statusEl.className = "status-msg";
  statusEl.textContent = "Submitting…";

  try {
    const res = await fetch("/api/student-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.details && data.details.join(" ")) || data.error || "Could not submit.");

    statusEl.textContent = "Submitted! A teacher will review it before it's used in a game.";
    statusEl.className = "status-msg success";
    document.getElementById("submit-form").reset();
    document.getElementById("submit-preview").classList.add("hidden");
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.className = "status-msg error";
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  ALL_BOOKS = await loadBooks();
  populateBookSelect(ALL_BOOKS);
})();
