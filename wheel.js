// wheel.js — Panther Bob Wheel
//
// Classic rules: consonants are free to guess; a correct guess reveals
// every occurrence and the same player goes again; a wrong guess passes
// the turn. Vowels cost points to reveal (deducted whether or not the
// vowel turns out to be in the title) but don't end the turn either way.
// Solving correctly ends the round with a bonus; solving incorrectly
// passes the turn, same as a wrong letter.

const VOWELS = ["A", "E", "I", "O", "U"];
const CONSONANT_POINTS_PER_LETTER = 10;
const VOWEL_COST = 25;
const SOLVE_BONUS = 50;
const WHEEL_USED_KEY = "pbq_wheel_used_titles_v1";

let ALL_BOOKS = [];
let players = []; // [{ name, score }]
let currentPlayerIndex = 0;
let currentBook = null;
let guessedLetters = new Set();
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
    return JSON.parse(localStorage.getItem(WHEEL_USED_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveUsedTitles(list) {
  localStorage.setItem(WHEEL_USED_KEY, JSON.stringify(list));
}

function pickNextBook() {
  let used = getUsedTitles();
  let available = ALL_BOOKS.filter((b) => !used.includes(b.title));
  if (available.length === 0) {
    used = [];
    available = ALL_BOOKS;
  }
  const chosen = available[Math.floor(Math.random() * available.length)];
  saveUsedTitles([...used, chosen.title]);
  return chosen;
}

// ---------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("wheel-setup-screen");
const gameScreen = document.getElementById("wheel-game-screen");
const playerCountSelect = document.getElementById("wheel-player-count");
const playerNameInputs = document.getElementById("wheel-player-name-inputs");
const startBtn = document.getElementById("wheel-start-btn");

function renderPlayerNameInputs() {
  const count = Number(playerCountSelect.value);
  playerNameInputs.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Player ${i} name`;
    input.id = `wheel-player-name-${i}`;
    input.maxLength = 24;
    playerNameInputs.appendChild(input);
  }
}
playerCountSelect.addEventListener("change", renderPlayerNameInputs);

startBtn.addEventListener("click", () => {
  const count = Number(playerCountSelect.value);
  players = [];
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`wheel-player-name-${i}`);
    const name = (input.value || `Player ${i}`).trim();
    players.push({ name, score: 0 });
  }
  currentPlayerIndex = 0;
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  startPuzzle();
});

// ---------------------------------------------------------------------
// Puzzle lifecycle
// ---------------------------------------------------------------------

function startPuzzle() {
  currentBook = pickNextBook();
  guessedLetters = new Set();
  roundOver = false;
  document.getElementById("wheel-message").textContent = "";
  document.getElementById("wheel-solve-input").value = "";
  document.getElementById("wheel-author-clue").textContent = currentBook.author;

  renderScoreboard();
  renderTurnIndicator();
  renderPuzzle();
  renderLetterGrid();
}

function renderScoreboard() {
  const el = document.getElementById("wheel-scoreboard");
  el.innerHTML = "";
  players.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "score-card" + (idx === currentPlayerIndex && !roundOver ? " active-turn" : "");
    card.innerHTML = `<div class="score-name">${escapeHtml(p.name)}</div><div class="score-value">${p.score}</div>`;
    el.appendChild(card);
  });
}

function renderTurnIndicator() {
  const el = document.getElementById("wheel-turn-indicator");
  el.textContent = roundOver ? "" : `${players[currentPlayerIndex].name}'s turn`;
}

function renderPuzzle() {
  const wrap = document.getElementById("wheel-puzzle");
  wrap.innerHTML = "";
  const title = currentBook.title;

  for (let i = 0; i < title.length; i++) {
    const ch = title[i];
    const tile = document.createElement("div");

    if (ch === " ") {
      tile.className = "wheel-tile space";
    } else if (!/[A-Za-z]/.test(ch)) {
      tile.className = "wheel-tile punct";
      tile.textContent = ch;
    } else if (guessedLetters.has(ch.toUpperCase()) || roundOver) {
      tile.className = "wheel-tile letter-revealed";
      tile.textContent = ch.toUpperCase();
    } else {
      tile.className = "wheel-tile letter-blank";
      tile.textContent = ch.toUpperCase();
    }
    wrap.appendChild(tile);
  }
}

function renderLetterGrid() {
  const grid = document.getElementById("wheel-letter-grid");
  grid.innerHTML = "";
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((letter) => {
    const btn = document.createElement("button");
    const isVowel = VOWELS.includes(letter);
    btn.className = "wheel-letter-btn" + (isVowel ? " vowel" : "");
    btn.textContent = isVowel ? `${letter}` : letter;
    btn.disabled = guessedLetters.has(letter) || roundOver;
    btn.addEventListener("click", () => onLetterClick(letter, isVowel));
    grid.appendChild(btn);
  });
}

function titleHasLetter(letter) {
  return currentBook.title.toUpperCase().includes(letter);
}

function countLetterOccurrences(letter) {
  return currentBook.title.toUpperCase().split("").filter((ch) => ch === letter).length;
}

function onLetterClick(letter, isVowel) {
  if (roundOver || guessedLetters.has(letter)) return;
  const messageEl = document.getElementById("wheel-message");

  if (isVowel) {
    const player = players[currentPlayerIndex];
    if (player.score < VOWEL_COST) {
      messageEl.textContent = `${player.name} needs at least ${VOWEL_COST} points to buy a vowel.`;
      return;
    }
    player.score -= VOWEL_COST;
    guessedLetters.add(letter);
    const present = titleHasLetter(letter);
    messageEl.textContent = present
      ? `${letter} is in the title! (-${VOWEL_COST} points to buy it)`
      : `No ${letter}. (-${VOWEL_COST} points)`;
    renderScoreboard();
    renderPuzzle();
    renderLetterGrid();
    checkForAutoSolve();
    return;
  }

  guessedLetters.add(letter);
  const count = countLetterOccurrences(letter);

  if (count > 0) {
    const points = count * CONSONANT_POINTS_PER_LETTER;
    players[currentPlayerIndex].score += points;
    messageEl.textContent = `Correct! ${letter} appears ${count} time${count > 1 ? "s" : ""}. +${points} points.`;
    renderScoreboard();
    renderPuzzle();
    renderLetterGrid();
    checkForAutoSolve();
  } else {
    messageEl.textContent = `No ${letter} in the title. Turn passes.`;
    passTurn();
    renderLetterGrid();
  }
}

function checkForAutoSolve() {
  const allLettersRevealed = currentBook.title
    .toUpperCase()
    .split("")
    .every((ch) => !/[A-Z]/.test(ch) || guessedLetters.has(ch));
  if (allLettersRevealed) {
    endRound(currentPlayerIndex, true);
  }
}

function passTurn() {
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  renderScoreboard();
  renderTurnIndicator();
}

// ---------------------------------------------------------------------
// Solve
// ---------------------------------------------------------------------

function normalizeForCompare(str) {
  return str.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

document.getElementById("wheel-solve-btn").addEventListener("click", attemptSolve);
document.getElementById("wheel-solve-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptSolve();
});

function attemptSolve() {
  if (roundOver) return;
  const input = document.getElementById("wheel-solve-input");
  const guess = input.value.trim();
  if (!guess) return;

  const messageEl = document.getElementById("wheel-message");
  if (normalizeForCompare(guess) === normalizeForCompare(currentBook.title)) {
    messageEl.textContent = `${players[currentPlayerIndex].name} solved it!`;
    endRound(currentPlayerIndex, true);
  } else {
    messageEl.textContent = "Not quite — turn passes.";
    input.value = "";
    passTurn();
  }
}

// ---------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------

function endRound(solverIndex, awardBonus) {
  roundOver = true;
  if (awardBonus) {
    players[solverIndex].score += SOLVE_BONUS;
  }
  guessedLetters = new Set(currentBook.title.toUpperCase().split("").filter((ch) => /[A-Z]/.test(ch)));
  renderScoreboard();
  renderTurnIndicator();
  renderPuzzle();
  renderLetterGrid();
  const messageEl = document.getElementById("wheel-message");
  messageEl.textContent += ` "${currentBook.title}" by ${currentBook.author}. +${SOLVE_BONUS} bonus to ${players[solverIndex].name}.`;
}

// ---------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------

document.getElementById("wheel-new-puzzle-btn").addEventListener("click", () => {
  startPuzzle();
});
document.getElementById("wheel-new-game-btn").addEventListener("click", () => {
  if (!confirm("Start a brand new game? This resets all scores.")) return;
  gameScreen.classList.add("hidden");
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
  ALL_BOOKS = await loadBooks();
})();
