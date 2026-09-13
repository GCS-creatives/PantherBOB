// bingo.js — Battle Bingo
//
// Caller: shuffles all 16 books and reveals them one at a time (no
// repeats until all 16 have been called). Card: a 4x4 grid containing
// all 16 books in a random arrangement per card — since every book
// appears on every card, the winning moment depends on the order the
// caller draws them versus each card's own layout, not on which books
// are present.

let ALL_BOOKS = [];
let callQueue = [];
let callIndex = 0;
let calledBooks = [];

let cardBooks = []; // 16 books in this card's order
let markedCells = new Set();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

// ---------------------------------------------------------------------
// Caller
// ---------------------------------------------------------------------

function resetCaller() {
  callQueue = shuffle(ALL_BOOKS);
  callIndex = 0;
  calledBooks = [];
  document.getElementById("bingo-caller-clue").textContent = 'Click "Call Next Book" to begin.';
  document.getElementById("bingo-call-btn").disabled = false;
  document.getElementById("bingo-call-btn").textContent = "Call Next Book";
  renderCalledChips();
}

function renderCalledChips() {
  document.getElementById("bingo-called-count").textContent = calledBooks.length;
  document.getElementById("bingo-called-chips").innerHTML = calledBooks
    .map((b) => `<span class="bingo-chip">${escapeHtml(b.title)}</span>`)
    .join("");
}

document.getElementById("bingo-call-btn").addEventListener("click", () => {
  if (callIndex >= callQueue.length) return;
  const book = callQueue[callIndex];
  callIndex += 1;
  calledBooks.push(book);

  document.getElementById("bingo-caller-clue").textContent = `${book.title} — ${book.author}`;
  speak(book.title);
  renderCalledChips();

  if (callIndex >= callQueue.length) {
    document.getElementById("bingo-call-btn").disabled = true;
    document.getElementById("bingo-call-btn").textContent = "All 16 Called!";
  }
});

document.getElementById("bingo-reset-caller-btn").addEventListener("click", () => {
  if (calledBooks.length > 0 && !confirm("Reset the caller and start a fresh draw order?")) return;
  resetCaller();
});

// ---------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------

function generateCard() {
  cardBooks = shuffle(ALL_BOOKS);
  markedCells = new Set();
  document.getElementById("bingo-win-banner").classList.add("hidden");
  renderCard();
}

function renderCard() {
  const grid = document.getElementById("bingo-card-grid");
  grid.innerHTML = "";
  cardBooks.forEach((book, idx) => {
    const btn = document.createElement("button");
    btn.className = "bingo-cell" + (markedCells.has(idx) ? " marked" : "");
    btn.textContent = book.title;
    btn.addEventListener("click", () => onCellClick(idx));
    grid.appendChild(btn);
  });
}

function onCellClick(idx) {
  if (markedCells.has(idx)) {
    markedCells.delete(idx);
  } else {
    markedCells.add(idx);
  }
  renderCard();
  if (checkBingo()) {
    document.getElementById("bingo-win-banner").classList.remove("hidden");
  }
}

function checkBingo() {
  const size = 4;
  const isMarked = (r, c) => markedCells.has(r * size + c);

  for (let r = 0; r < size; r++) {
    if ([0, 1, 2, 3].every((c) => isMarked(r, c))) return true;
  }
  for (let c = 0; c < size; c++) {
    if ([0, 1, 2, 3].every((r) => isMarked(r, c))) return true;
  }
  if ([0, 1, 2, 3].every((i) => isMarked(i, i))) return true;
  if ([0, 1, 2, 3].every((i) => isMarked(i, size - 1 - i))) return true;
  return false;
}

document.getElementById("bingo-new-card-btn").addEventListener("click", () => {
  if (markedCells.size > 0 && !confirm("Get a new card? This clears your current marks.")) return;
  generateCard();
});

// ---------------------------------------------------------------------
// Utilities + init
// ---------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  ALL_BOOKS = await loadBooks();
  resetCaller();
  generateCard();
})();
