// truthlie.js — Two Truths and a Lie
//
// Each round shows one book's title plus three statements (shuffled),
// two true and one false. Players guess out loud which is the lie; the
// host reveals the answer (highlighting the false one) and awards a
// point to whoever got it right. Goes through all 16 books once per
// game, in random order.

let allBooks = [];
let roundOrder = [];
let roundIndex = 0;
let currentStatements = [];
let players = [];
let revealed = false;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadData() {
  const res = await fetch("./data/two-truths-lie.json");
  return res.json();
}

// ---------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("tl-setup-screen");
const gameScreen = document.getElementById("tl-game-screen");
const completeScreen = document.getElementById("tl-complete-screen");

function renderPlayerNameInputs() {
  const count = Number(document.getElementById("tl-player-count").value);
  const wrap = document.getElementById("tl-player-name-inputs");
  wrap.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Player ${i} name`;
    input.id = `tl-player-name-${i}`;
    input.maxLength = 24;
    wrap.appendChild(input);
  }
}
document.getElementById("tl-player-count").addEventListener("change", renderPlayerNameInputs);

document.getElementById("tl-start-btn").addEventListener("click", () => {
  const count = Number(document.getElementById("tl-player-count").value);
  players = [];
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`tl-player-name-${i}`);
    players.push({ name: (input.value || `Player ${i}`).trim(), score: 0 });
  }
  roundOrder = shuffle(allBooks);
  roundIndex = 0;

  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  renderScoreboard();
  showRound();
});

function renderScoreboard() {
  const el = document.getElementById("tl-scoreboard");
  el.innerHTML = players
    .map((p) => `<div class="score-card"><div class="score-name">${escapeHtml(p.name)}</div><div class="score-value">${p.score}</div></div>`)
    .join("");
}

// ---------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------

function showRound() {
  const book = roundOrder[roundIndex];
  currentStatements = shuffle(book.statements.map((s, i) => ({ ...s, key: i })));
  revealed = false;

  document.getElementById("tl-book-title").textContent = `${book.title} — ${book.author}`;
  renderStatements();

  document.getElementById("tl-reveal-btn").classList.remove("hidden");
  document.getElementById("tl-next-btn").classList.add("hidden");
  document.getElementById("tl-award-block").classList.add("hidden");
}

function renderStatements() {
  const wrap = document.getElementById("tl-statements");
  const letters = ["A", "B", "C"];
  wrap.innerHTML = currentStatements
    .map((s, idx) => {
      let cls = "tl-statement";
      if (revealed) cls += s.isTrue ? " tl-true" : " tl-lie";
      return `<div class="${cls}"><span class="tl-letter">${letters[idx]}</span>${escapeHtml(s.text)}</div>`;
    })
    .join("");
}

document.getElementById("tl-reveal-btn").addEventListener("click", () => {
  revealed = true;
  renderStatements();
  document.getElementById("tl-reveal-btn").classList.add("hidden");
  document.getElementById("tl-next-btn").classList.remove("hidden");
  renderAwardButtons();
  document.getElementById("tl-award-block").classList.remove("hidden");
});

function renderAwardButtons() {
  const wrap = document.getElementById("tl-award-buttons");
  wrap.innerHTML = players
    .map((p, idx) => `<button class="btn" data-idx="${idx}">${escapeHtml(p.name)} +1</button>`)
    .join("");
  wrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      players[idx].score += 1;
      renderScoreboard();
      btn.disabled = true;
    });
  });
}

document.getElementById("tl-next-btn").addEventListener("click", () => {
  roundIndex += 1;
  if (roundIndex >= roundOrder.length) {
    showComplete();
  } else {
    showRound();
  }
});

function showComplete() {
  gameScreen.classList.add("hidden");
  completeScreen.classList.remove("hidden");
  const sorted = [...players].sort((a, b) => b.score - a.score);
  document.getElementById("tl-final-scores").textContent = sorted
    .map((p) => `${p.name}: ${p.score}`)
    .join(" · ");
}

document.getElementById("tl-restart-btn").addEventListener("click", () => {
  completeScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
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
  renderPlayerNameInputs();
  allBooks = await loadData();
})();
