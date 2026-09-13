// match.js — Panther Bob Match (title/author memory game)
//
// Each round uses 8 of the 16 books (16 cards: 8 title cards + 8 author
// cards). Which 8 appear rotates using the same "don't repeat until the
// pool runs out" idea as the board game: books already used in this cycle
// are tracked in localStorage, so you see every book across roughly two
// rounds before anything repeats.

const MATCH_USED_KEY = "pbq_match_used_titles_v1";
const CARDS_PER_ROUND = 8; // book pairs per round (16 cards total)
const MISMATCH_DELAY_MS = 900;

let ALL_BOOKS = [];
let players = []; // [{ name, score }]
let roundSeconds = 60;
let remainingSeconds = 60;
let timerInterval = null;
let currentPlayerIndex = 0;
let cards = []; // { id, pairId, type, text, flipped, matched }
let flippedIds = [];
let boardLocked = false;
let matchedPairCount = 0;
let roundOver = false;

// ---------------------------------------------------------------------
// Data + rotation
// ---------------------------------------------------------------------

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

function getUsedTitles() {
  try {
    return JSON.parse(localStorage.getItem(MATCH_USED_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveUsedTitles(list) {
  localStorage.setItem(MATCH_USED_KEY, JSON.stringify(list));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickBooksForRound() {
  let used = getUsedTitles();
  let available = ALL_BOOKS.filter((b) => !used.includes(b.title));

  if (available.length < CARDS_PER_ROUND) {
    used = [];
    available = ALL_BOOKS;
  }

  const chosen = shuffle(available).slice(0, CARDS_PER_ROUND);
  const newUsed = [...used, ...chosen.map((b) => b.title)];
  saveUsedTitles(newUsed);
  return chosen;
}

// ---------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("match-setup-screen");
const gameScreen = document.getElementById("match-game-screen");
const startBtn = document.getElementById("match-start-btn");
const player1Input = document.getElementById("match-player-1");
const player2Input = document.getElementById("match-player-2");
const timerSecondsInput = document.getElementById("match-timer-seconds");

startBtn.addEventListener("click", () => {
  const p1 = (player1Input.value || "Player 1").trim();
  const p2 = (player2Input.value || "Player 2").trim();
  players = [
    { name: p1, score: 0 },
    { name: p2, score: 0 },
  ];
  roundSeconds = Math.max(20, Math.min(600, Number(timerSecondsInput.value) || 60));

  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  startRound();
});

// ---------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------

function startRound() {
  const books = pickBooksForRound();
  buildCards(books);
  currentPlayerIndex = 0;
  flippedIds = [];
  boardLocked = false;
  matchedPairCount = 0;
  roundOver = false;
  remainingSeconds = roundSeconds;

  renderScores();
  renderTurnIndicator();
  renderTimer();
  renderGrid();
  startTimer();
}

function buildCards(books) {
  const raw = [];
  books.forEach((b, i) => {
    raw.push({ id: `t-${i}`, pairId: i, type: "title", text: b.title, flipped: false, matched: false });
    raw.push({ id: `a-${i}`, pairId: i, type: "author", text: b.author, flipped: false, matched: false });
  });
  cards = shuffle(raw);
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    renderTimer();
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      endRound("time");
    }
  }, 1000);
}

function endRound(reason) {
  if (roundOver) return;
  roundOver = true;
  clearInterval(timerInterval);
  boardLocked = true;
  showResults(reason);
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function renderScores() {
  const el1 = document.getElementById("match-score-1");
  const el2 = document.getElementById("match-score-2");
  [el1, el2].forEach((el, idx) => {
    el.innerHTML = `<div class="score-name">${escapeHtml(players[idx].name)}</div><div class="score-value">${players[idx].score}</div>`;
    el.classList.toggle("active-turn", idx === currentPlayerIndex && !roundOver);
  });
}

function renderTurnIndicator() {
  const el = document.getElementById("match-turn-indicator");
  if (roundOver) {
    el.textContent = "";
    return;
  }
  el.textContent = `${players[currentPlayerIndex].name}'s turn`;
}

function renderTimer() {
  const el = document.getElementById("match-timer");
  el.textContent = Math.max(0, remainingSeconds);
  el.classList.toggle("low-time", remainingSeconds <= 10 && remainingSeconds > 0);
}

function renderGrid() {
  const grid = document.getElementById("match-grid");
  grid.innerHTML = "";
  cards.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "match-card" + (card.flipped ? " flipped" : "") + (card.matched ? " matched" : "");
    cardEl.innerHTML = `
      <div class="match-card-inner">
        <div class="match-card-face match-card-back"></div>
        <div class="match-card-face match-card-front">${escapeHtml(card.text)}</div>
      </div>
    `;
    if (!card.matched) {
      cardEl.addEventListener("click", () => onCardClick(card.id));
    }
    grid.appendChild(cardEl);
  });
}

// ---------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------

function onCardClick(cardId) {
  if (roundOver || boardLocked) return;
  const card = cards.find((c) => c.id === cardId);
  if (!card || card.flipped || card.matched) return;
  if (flippedIds.length >= 2) return;

  card.flipped = true;
  flippedIds.push(cardId);
  renderGrid();

  if (flippedIds.length === 2) {
    boardLocked = true;
    const [firstId, secondId] = flippedIds;
    const first = cards.find((c) => c.id === firstId);
    const second = cards.find((c) => c.id === secondId);

    if (first.pairId === second.pairId) {
      // Match! Same player continues.
      setTimeout(() => {
        first.matched = true;
        second.matched = true;
        matchedPairCount += 1;
        players[currentPlayerIndex].score += 1;
        flippedIds = [];
        boardLocked = false;
        renderScores();
        renderGrid();
        if (matchedPairCount === CARDS_PER_ROUND) {
          endRound("complete");
        }
      }, 400);
    } else {
      // No match — flip back, pass the turn.
      setTimeout(() => {
        first.flipped = false;
        second.flipped = false;
        flippedIds = [];
        boardLocked = false;
        currentPlayerIndex = currentPlayerIndex === 0 ? 1 : 0;
        renderScores();
        renderTurnIndicator();
        renderGrid();
      }, MISMATCH_DELAY_MS);
    }
  }
}

// ---------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------

const resultsModal = document.getElementById("match-results-modal");
const resultHeadline = document.getElementById("match-result-headline");
const resultDetail = document.getElementById("match-result-detail");

function showResults(reason) {
  renderScores();
  renderTurnIndicator();

  const [p1, p2] = players;
  let headline;
  if (p1.score === p2.score) {
    headline = `It's a tie! ${p1.score} — ${p2.score}`;
  } else {
    const winner = p1.score > p2.score ? p1 : p2;
    headline = `${winner.name} wins!`;
  }
  const reasonText = reason === "time" ? "Time ran out." : "All pairs found!";

  resultHeadline.textContent = headline;
  resultDetail.textContent = `${reasonText} Final score — ${p1.name}: ${p1.score}, ${p2.name}: ${p2.score}.`;
  resultsModal.classList.remove("hidden");
}

document.getElementById("match-result-play-again-btn").addEventListener("click", () => {
  resultsModal.classList.add("hidden");
  startRound();
});
document.getElementById("match-result-new-game-btn").addEventListener("click", () => {
  resultsModal.classList.add("hidden");
  returnToSetup();
});

// ---------------------------------------------------------------------
// Controls (in-game buttons)
// ---------------------------------------------------------------------

document.getElementById("match-play-again-btn").addEventListener("click", () => {
  startRound();
});
document.getElementById("match-new-game-btn").addEventListener("click", () => {
  if (!confirm("Start a brand new game? This resets both scores.")) return;
  returnToSetup();
});

function returnToSetup() {
  clearInterval(timerInterval);
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
}

document.querySelector("#match-results-modal .modal-backdrop").addEventListener("click", () => {
  resultsModal.classList.add("hidden");
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
})();
