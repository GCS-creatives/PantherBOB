// app.js — Panther Bob Quiz game logic
//
// How the "don't repeat until the pool runs out" system works:
//   For every (category, points) cell, we track which question ids from
//   that cell have already been shown, in localStorage under PBQ_USED_KEY.
//   When a new board is generated, each cell draws a random *unused*
//   question. Once every question in a cell has been used, that cell's
//   "used" list resets automatically and the pool starts over — so the
//   game never gets stuck, it just starts recycling once you've truly
//   seen everything available for that category/difficulty.
//
// Categories shown per board: 5 are chosen at random from the full pool
// of categories in the question bank (currently 8), so which 5 appear —
// and in what order — changes round to round.

const POINTS_TIERS = [100, 200, 300, 400, 500];
const PBQ_USED_KEY = "pbq_used_ids_v1";
const PBQ_STATE_KEY = "pbq_state_v1";

let QUESTION_BANK = [];
let state = {
  players: [],       // [{ name, score }]
  round: 1,
  board: null,        // { categories: [...], cells: { "cat|points": questionId } }
  answeredThisRound: [], // ["cat|points", ...]
};

// ---------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------

async function loadQuestionBank() {
  try {
    const res = await fetch("/api/questions");
    if (!res.ok) throw new Error("API not available");
    return await res.json();
  } catch (e) {
    // Fallback for local testing without Netlify functions running,
    // or if the API is temporarily unreachable.
    const res = await fetch("./data/seed-questions.json");
    return await res.json();
  }
}

function getCellKey(category, points) {
  return `${category}|${points}`;
}

function getUsedTracker() {
  try {
    return JSON.parse(localStorage.getItem(PBQ_USED_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveUsedTracker(tracker) {
  localStorage.setItem(PBQ_USED_KEY, JSON.stringify(tracker));
}

function saveState() {
  localStorage.setItem(PBQ_STATE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PBQ_STATE_KEY));
    if (saved && saved.players && saved.players.length) return saved;
  } catch (e) {}
  return null;
}

// ---------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getAllCategories() {
  return [...new Set(QUESTION_BANK.map((q) => q.category))];
}

function pickQuestionForCell(category, points, usedTracker) {
  const cellKey = getCellKey(category, points);
  const candidates = QUESTION_BANK.filter(
    (q) => q.category === category && Number(q.points) === Number(points)
  );
  if (candidates.length === 0) return null; // no questions written for this cell yet

  const usedIds = usedTracker[cellKey] || [];
  let available = candidates.filter((q) => !usedIds.includes(q.id));

  if (available.length === 0) {
    // Pool exhausted for this cell — reset and start recycling.
    usedTracker[cellKey] = [];
    available = candidates;
  }

  const chosen = available[Math.floor(Math.random() * available.length)];
  return chosen;
}

function generateBoard() {
  const allCategories = getAllCategories();
  const numCategories = Math.min(5, allCategories.length);
  const chosenCategories = shuffle(allCategories).slice(0, numCategories);

  const usedTracker = getUsedTracker();
  const cells = {};

  chosenCategories.forEach((cat) => {
    POINTS_TIERS.forEach((pts) => {
      const q = pickQuestionForCell(cat, pts, usedTracker);
      cells[getCellKey(cat, pts)] = q ? q.id : null;
    });
  });

  saveUsedTracker(usedTracker); // reserve exhausted-pool resets, not the picks themselves yet

  return { categories: chosenCategories, cells };
}

function markQuestionUsed(category, points, questionId) {
  const usedTracker = getUsedTracker();
  const cellKey = getCellKey(category, points);
  if (!usedTracker[cellKey]) usedTracker[cellKey] = [];
  if (!usedTracker[cellKey].includes(questionId)) {
    usedTracker[cellKey].push(questionId);
  }
  saveUsedTracker(usedTracker);
}

function findQuestionById(id) {
  return QUESTION_BANK.find((q) => q.id === id);
}

// ---------------------------------------------------------------------
// Rendering: Setup screen
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const playerCountSelect = document.getElementById("player-count");
const playerNameInputs = document.getElementById("player-name-inputs");
const startGameBtn = document.getElementById("start-game-btn");

function renderPlayerNameInputs() {
  const count = Number(playerCountSelect.value);
  playerNameInputs.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Player ${i} name`;
    input.id = `player-name-${i}`;
    input.maxLength = 24;
    playerNameInputs.appendChild(input);
  }
}

playerCountSelect.addEventListener("change", renderPlayerNameInputs);

startGameBtn.addEventListener("click", () => {
  const count = Number(playerCountSelect.value);
  const players = [];
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`player-name-${i}`);
    const name = (input.value || `Player ${i}`).trim();
    players.push({ name, score: 0 });
  }
  state.players = players;
  state.round = 1;
  state.answeredThisRound = [];
  state.board = generateBoard();
  saveState();
  showGameScreen();
});

// ---------------------------------------------------------------------
// Rendering: Game screen
// ---------------------------------------------------------------------

const scoreboardEl = document.getElementById("scoreboard");
const boardEl = document.getElementById("board");
const roundLabelEl = document.getElementById("round-label");
const newRoundBtn = document.getElementById("new-round-btn");
const newGameBtn = document.getElementById("new-game-btn");

function showGameScreen() {
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  renderScoreboard();
  renderBoard();
}

function renderScoreboard() {
  scoreboardEl.innerHTML = "";
  state.players.forEach((p) => {
    const card = document.createElement("div");
    card.className = "score-card";
    card.innerHTML = `
      <div class="score-name">${escapeHtml(p.name)}</div>
      <div class="score-value">${p.score}</div>
    `;
    scoreboardEl.appendChild(card);
  });
}

function renderBoard() {
  roundLabelEl.textContent = `Round ${state.round}`;
  boardEl.innerHTML = "";

  const { categories, cells } = state.board;

  // Category header row
  categories.forEach((cat) => {
    const header = document.createElement("div");
    header.className = "board-category";
    header.textContent = cat;
    boardEl.appendChild(header);
  });

  // Point rows
  POINTS_TIERS.forEach((pts) => {
    categories.forEach((cat) => {
      const cellKey = getCellKey(cat, pts);
      const questionId = cells[cellKey];
      const btn = document.createElement("button");
      btn.className = "board-cell";
      const alreadyAnswered = state.answeredThisRound.includes(cellKey);

      if (!questionId) {
        btn.textContent = "—";
        btn.disabled = true;
        btn.title = "No question written yet for this category/difficulty.";
      } else if (alreadyAnswered) {
        btn.textContent = "";
        btn.disabled = true;
      } else {
        btn.textContent = `$${pts}`;
        btn.addEventListener("click", () => openClue(cat, pts, questionId));
      }
      boardEl.appendChild(btn);
    });
  });
}

newRoundBtn.addEventListener("click", () => {
  state.round += 1;
  state.answeredThisRound = [];
  state.board = generateBoard();
  saveState();
  renderBoard();
});

newGameBtn.addEventListener("click", () => {
  if (!confirm("Start a brand new game? This resets scores and the question rotation.")) return;
  localStorage.removeItem(PBQ_STATE_KEY);
  localStorage.removeItem(PBQ_USED_KEY);
  state = { players: [], round: 1, board: null, answeredThisRound: [] };
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});

// ---------------------------------------------------------------------
// Clue modal
// ---------------------------------------------------------------------

const clueModal = document.getElementById("clue-modal");
const modalCategory = document.getElementById("modal-category");
const modalPoints = document.getElementById("modal-points");
const modalClue = document.getElementById("modal-clue");
const modalAnswerBlock = document.getElementById("modal-answer-block");
const modalAnswer = document.getElementById("modal-answer");
const revealAnswerBtn = document.getElementById("reveal-answer-btn");
const awardBlock = document.getElementById("award-block");
const awardPlayerButtons = document.getElementById("award-player-buttons");
const noOneBtn = document.getElementById("no-one-btn");

let activeClue = null; // { category, points, questionId, cellKey }

function openClue(category, points, questionId) {
  const question = findQuestionById(questionId);
  if (!question) return;

  activeClue = { category, points, questionId, cellKey: getCellKey(category, points) };

  modalCategory.textContent = category;
  modalPoints.textContent = `$${points}`;
  modalClue.textContent = question.clue;
  modalAnswer.textContent = `${question.answerTitle} — ${question.answerAuthor}`;

  modalAnswerBlock.classList.add("hidden");
  awardBlock.classList.add("hidden");
  revealAnswerBtn.classList.remove("hidden");

  renderAwardButtons();
  clueModal.classList.remove("hidden");
}

function renderAwardButtons() {
  awardPlayerButtons.innerHTML = "";
  state.players.forEach((p, idx) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = p.name;
    btn.addEventListener("click", () => awardPoints(idx));
    awardPlayerButtons.appendChild(btn);
  });
}

revealAnswerBtn.addEventListener("click", () => {
  modalAnswerBlock.classList.remove("hidden");
  awardBlock.classList.remove("hidden");
  revealAnswerBtn.classList.add("hidden");
});

function awardPoints(playerIndex) {
  if (!activeClue) return;
  state.players[playerIndex].score += activeClue.points;
  closeClueAndMarkAnswered();
}

noOneBtn.addEventListener("click", () => {
  closeClueAndMarkAnswered();
});

function closeClueAndMarkAnswered() {
  if (!activeClue) return;
  state.answeredThisRound.push(activeClue.cellKey);
  markQuestionUsed(activeClue.category, activeClue.points, activeClue.questionId);
  saveState();
  clueModal.classList.add("hidden");
  activeClue = null;
  renderScoreboard();
  renderBoard();
}

document.querySelector(".modal-backdrop").addEventListener("click", () => {
  // Prevent accidentally losing a clue mid-question; just close visually,
  // the cell stays open (not marked answered) so the host can reopen it.
  clueModal.classList.add("hidden");
  activeClue = null;
});

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  renderPlayerNameInputs();

  QUESTION_BANK = await loadQuestionBank();

  const saved = loadState();
  if (saved) {
    state = saved;
    showGameScreen();
  }
})();
