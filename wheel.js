// wheel.js — Panther Bob Wheel
//
// No author clue — showing the author would let anyone who already knows
// the author/title pairing solve instantly without guessing any letters.
//
// Turn flow: spin the wheel to set a point value, then guess ONE
// consonant at that value (correct = value x occurrences, same player
// keeps going but must spin again for the next consonant; wrong = turn
// passes). Vowels are bought with a flat point cost any time during a
// turn, independent of the wheel. Landing on BANKRUPT zeroes the current
// player's score and ends their turn; LOSE A TURN just ends it. Solving
// the title correctly (any time) ends the round with a bonus; solving
// incorrectly passes the turn, same as a wrong letter.

const VOWELS = ["A", "E", "I", "O", "U"];
const VOWEL_COST = 25;
const SOLVE_BONUS = 50;
const WHEEL_USED_KEY = "pbq_wheel_used_titles_v1";

// 12 wedges, 30 degrees each. Mostly point values, one BANKRUPT, one
// LOSE A TURN — mirrors the real show's mix without needing 24 wedges.
const WHEEL_SEGMENTS = [
  { type: "points", value: 500, color: "#0a1172" },
  { type: "points", value: 300, color: "#f5c518" },
  { type: "points", value: 700, color: "#1f9d55" },
  { type: "points", value: 400, color: "#0a1172" },
  { type: "bankrupt", label: "BANKRUPT", color: "#1c1c1c" },
  { type: "points", value: 600, color: "#f5c518" },
  { type: "points", value: 900, color: "#d64545" },
  { type: "points", value: 500, color: "#0a1172" },
  { type: "loseturn", label: "LOSE A TURN", color: "#6a6f9e" },
  { type: "points", value: 800, color: "#f5c518" },
  { type: "points", value: 400, color: "#1f9d55" },
  { type: "points", value: 650, color: "#0a1172" },
];
const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

let ALL_BOOKS = [];
let players = []; // [{ name, score }]
let currentPlayerIndex = 0;
let currentBook = null;
let guessedLetters = new Set();
let roundOver = false;
let currentSpinValue = null; // number when a point value is active and awaiting a consonant guess
let isSpinning = false;
let wheelTotalRotation = 0; // accumulated, so each spin keeps turning forward

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
  buildWheelSegments();
  startPuzzle();
});

// ---------------------------------------------------------------------
// Wheel
// ---------------------------------------------------------------------

function buildWheelSegments() {
  const spinner = document.getElementById("wheel-spinner");

  const gradientStops = WHEEL_SEGMENTS.map((seg, i) => {
    const start = i * SEGMENT_ANGLE;
    const end = start + SEGMENT_ANGLE;
    return `${seg.color} ${start}deg ${end}deg`;
  }).join(", ");
  spinner.style.background = `conic-gradient(${gradientStops})`;

  spinner.querySelectorAll(".wheel-segment-label").forEach((el) => el.remove());
  WHEEL_SEGMENTS.forEach((seg, i) => {
    const midAngle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const label = document.createElement("div");
    label.className = "wheel-segment-label";
    label.style.transform = `rotate(${midAngle}deg) translate(68px, -6px)`;
    label.textContent = seg.type === "points" ? seg.value : seg.label;
    spinner.appendChild(label);
  });
}

function spinWheel(onDone) {
  isSpinning = true;
  document.getElementById("wheel-spin-btn").disabled = true;

  const targetIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
  const segMid = targetIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  // Small random jitter within the segment so it doesn't always land dead-center.
  const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.6);
  const extraSpins = 5 * 360;
  const targetWithinTurn = (360 - (segMid + jitter) + 360) % 360;

  wheelTotalRotation += extraSpins + ((targetWithinTurn - (wheelTotalRotation % 360)) + 360) % 360;

  const spinner = document.getElementById("wheel-spinner");
  spinner.style.transform = `rotate(${wheelTotalRotation}deg)`;

  const handleEnd = () => {
    spinner.removeEventListener("transitionend", handleEnd);
    isSpinning = false;
    onDone(WHEEL_SEGMENTS[targetIndex]);
  };
  spinner.addEventListener("transitionend", handleEnd);
}

document.getElementById("wheel-spin-btn").addEventListener("click", () => {
  if (roundOver || isSpinning || currentSpinValue !== null) return;
  document.getElementById("wheel-message").textContent = "";
  spinWheel((segment) => {
    if (segment.type === "bankrupt") {
      players[currentPlayerIndex].score = 0;
      document.getElementById("wheel-message").textContent =
        `${players[currentPlayerIndex].name} hit BANKRUPT! Score reset to 0. Turn passes.`;
      renderScoreboard();
      passTurn();
      updateSpinControls();
    } else if (segment.type === "loseturn") {
      document.getElementById("wheel-message").textContent =
        `${players[currentPlayerIndex].name} hit LOSE A TURN.`;
      passTurn();
      updateSpinControls();
    } else {
      currentSpinValue = segment.value;
      document.getElementById("wheel-message").textContent =
        `${players[currentPlayerIndex].name} spun ${segment.value} — pick a consonant!`;
      updateSpinControls();
      renderLetterGrid();
    }
  });
});

function updateSpinControls() {
  const spinBtn = document.getElementById("wheel-spin-btn");
  const valueEl = document.getElementById("wheel-current-value");
  spinBtn.disabled = roundOver || isSpinning || currentSpinValue !== null;
  valueEl.textContent = currentSpinValue !== null ? `Current value: ${currentSpinValue}` : "";
}

// ---------------------------------------------------------------------
// Puzzle lifecycle
// ---------------------------------------------------------------------

function startPuzzle() {
  currentBook = pickNextBook();
  guessedLetters = new Set();
  roundOver = false;
  currentSpinValue = null;
  document.getElementById("wheel-message").textContent = "";
  document.getElementById("wheel-solve-input").value = "";

  renderScoreboard();
  renderTurnIndicator();
  renderPuzzle();
  renderLetterGrid();
  updateSpinControls();
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
    btn.textContent = letter;
    const alreadyGuessed = guessedLetters.has(letter);
    // Consonants need an active spin value; vowels just need points + turn active.
    const blocked = roundOver || alreadyGuessed || (!isVowel && currentSpinValue === null);
    btn.disabled = blocked;
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
  if (!isVowel && currentSpinValue === null) return;
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
  const spinValueUsed = currentSpinValue;
  currentSpinValue = null;

  if (count > 0) {
    const points = count * spinValueUsed;
    players[currentPlayerIndex].score += points;
    messageEl.textContent = `Correct! ${letter} appears ${count} time${count > 1 ? "s" : ""} at ${spinValueUsed} each. +${points} points. Spin again!`;
    renderScoreboard();
    renderPuzzle();
    renderLetterGrid();
    updateSpinControls();
    checkForAutoSolve();
  } else {
    messageEl.textContent = `No ${letter} in the title. Turn passes.`;
    passTurn();
    renderLetterGrid();
    updateSpinControls();
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
  currentSpinValue = null;
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
    updateSpinControls();
    renderLetterGrid();
  }
}

// ---------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------

function endRound(solverIndex, awardBonus) {
  roundOver = true;
  currentSpinValue = null;
  if (awardBonus) {
    players[solverIndex].score += SOLVE_BONUS;
  }
  guessedLetters = new Set(currentBook.title.toUpperCase().split("").filter((ch) => /[A-Z]/.test(ch)));
  renderScoreboard();
  renderTurnIndicator();
  renderPuzzle();
  renderLetterGrid();
  updateSpinControls();
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
