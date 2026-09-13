// authors.js — reads each author's name aloud using the browser's
// built-in speech synthesis (window.speechSynthesis). No audio files,
// no external service — works offline once the page has loaded.

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function renderList(books) {
  const container = document.getElementById("authors-list");
  container.innerHTML = "";

  books.forEach((b) => {
    const row = document.createElement("div");
    row.className = "author-row";

    const tbLink = b.teachingBooksUrl
      ? `<a class="author-tb-btn" href="${b.teachingBooksUrl}" target="_blank" rel="noopener noreferrer" title="Professional recording on TeachingBooks">🎓 TeachingBooks</a>`
      : `<span class="author-tb-missing" title="Not currently listed on TeachingBooks">Not on TeachingBooks</span>`;

    row.innerHTML = `
      <div class="author-info">
        <div class="author-name">${escapeHtml(b.author)}</div>
        <div class="author-book">${escapeHtml(b.title)}</div>
      </div>
      <div class="author-actions">
        <button class="author-play-btn" aria-label="Play pronunciation of ${escapeHtml(b.author)}">🔊</button>
        ${tbLink}
      </div>
    `;
    row.querySelector(".author-play-btn").addEventListener("click", () => speak(b.author));
    container.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();

  if (!("speechSynthesis" in window)) {
    document.getElementById("authors-support-warning").classList.remove("hidden");
  }

  const books = await loadBooks();
  renderList(books);

  document.getElementById("play-all-btn").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    books.forEach((b) => speak(b.author));
  });
})();
