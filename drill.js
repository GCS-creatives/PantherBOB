// drill.js — Panther Bob Drill (speed match)
//
// All 16 books' titles and authors bounce around a bounded arena as
// independently-moving tiles (classic "DVD logo" bounce physics). The
// player clicks a title, then clicks the author they think matches (or
// vice versa) — a correct pair pops and disappears; a wrong guess just
// flashes red and deselects, no penalty besides lost time. Each player
// gets one attempt at a fresh, freshly-shuffled board, timed by a shared
// countdown cap. Clearing all 16 pairs ends the turn early and locks in
// the elapsed time; running out of time ends the turn with however many
// pairs were found.
//
// Final ranking: most pairs found wins; among players who fully cleared
// the board, the faster elapsed time wins the tiebreak.

const MIN_SPEED = 55;   // px/sec
const MAX_SPEED = 115;  // px/sec

let ALL_BOOKS = [];
let players = []; // [{ name, pairsFound, elapsedSeconds, completed }]
let capSeconds = 120;
let currentPlayerIndex = 0;

let arenaEl = null;
let tiles = [];      // { id, pairId, type, text, el, x, y, w, h, vx, vy, matched }
let selectedTile = null;
let pairsFound = 0;
let remainingSeconds = 120;
let timerInterval = null;
let animFrameId = null;
let lastFrameTime = null;
let turnActive = false;

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("drill-setup-screen");
const readyScreen = document.getElementById("drill-ready-screen");
const gameScreen = document.getElementById("drill-game-screen");

const playerCountSelect = document.getElementById("drill-player-count");
const playerNameInputs = document.getElementById("drill-player-name-inputs");
const timerSecondsInput = document.getElementById("drill-timer-seconds");
const startBtn = document.getElementById("drill-start-btn");

function renderPlayerNameInputs() {
  const count = Number(playerCountSelect.value);
  playerNameInputs.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Player ${i} name`;
    input.id = `drill-player-name-${i}`;
    input.maxLength = 24;
    playerNameInputs.appendChild(input);
  }
}
playerCountSelect.addEventListener("change", renderPlayerNameInputs);

startBtn.addEventListener("click", () => {
  const count = Number(playerCountSelect.value);
  players = [];
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`drill-player-name-${i}`);
    const name = (input.value || `Player ${i}`).trim();
    players.push({ name, pairsFound: 0, elapsedSeconds: 0, completed: false });
  }
  capSeconds = Math.max(30, Math.min(600, Number(timerSecondsInput.value) || 120));
  currentPlayerIndex = 0;

  setupScreen.classList.add("hidden");
  showReadyScreen();
});

// ---------------------------------------------------------------------
// Ready screen (between turns)
// ---------------------------------------------------------------------

const readyHeadline = document.getElementById("drill-ready-headline");
const readyGoBtn = document.getElementById("drill-ready-go-btn");

function showReadyScreen() {
  readyHeadline.textContent = `${players[currentPlayerIndex].name}'s turn`;
  gameScreen.classList.add("hidden");
  readyScreen.classList.remove("hidden");
}

readyGoBtn.addEventListener("click", () => {
  readyScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  startTurn();
});

// ---------------------------------------------------------------------
// Turn lifecycle
// ---------------------------------------------------------------------

function startTurn() {
  arenaEl = document.getElementById("drill-arena");
  document.getElementById("drill-turn-name").textContent = players[currentPlayerIndex].name;
  pairsFound = 0;
  selectedTile = null;
  remainingSeconds = capSeconds;
  turnActive = true;

  renderProgress();
  renderTimer();
  buildTiles();
  startTimer();
  startAnimationLoop();
}

function buildTiles() {
  arenaEl.innerHTML = "";
  tiles = [];
  const arenaW = arenaEl.clientWidth;
  const arenaH = arenaEl.clientHeight;

  const raw = [];
  ALL_BOOKS.forEach((b, i) => {
    raw.push({ pairId: i, type: "title", text: b.title });
    raw.push({ pairId: i, type: "author", text: b.author });
  });

  shuffle(raw).forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = `drill-tile type-${item.type}`;
    el.textContent = item.text;
    arenaEl.appendChild(el);

    const w = el.offsetWidth || 150;
    const h = el.offsetHeight || 40;
    const x = Math.random() * Math.max(1, arenaW - w);
    const y = Math.random() * Math.max(1, arenaH - h);
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    const angle = Math.random() * Math.PI * 2;

    const tile = {
      id: `tile-${idx}`,
      pairId: item.pairId,
      type: item.type,
      text: item.text,
      el,
      x, y, w, h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      matched: false,
    };
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.addEventListener("click", () => onTileClick(tile));
    tiles.push(tile);
  });
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    renderTimer();
    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      renderTimer();
      endTurn(false);
    }
  }, 1000);
}

function startAnimationLoop() {
  lastFrameTime = null;
  cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(tick);
}

function tick(now) {
  if (!turnActive) return;
  if (lastFrameTime === null) lastFrameTime = now;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000); // cap dt to avoid big jumps
  lastFrameTime = now;

  const arenaW = arenaEl.clientWidth;
  const arenaH = arenaEl.clientHeight;

  tiles.forEach((t) => {
    if (t.matched) return;
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    if (t.x <= 0) { t.x = 0; t.vx = Math.abs(t.vx); }
    if (t.x + t.w >= arenaW) { t.x = arenaW - t.w; t.vx = -Math.abs(t.vx); }
    if (t.y <= 0) { t.y = 0; t.vy = Math.abs(t.vy); }
    if (t.y + t.h >= arenaH) { t.y = arenaH - t.h; t.vy = -Math.abs(t.vy); }

    t.el.style.transform = `translate(${t.x}px, ${t.y}px)`;
  });

  animFrameId = requestAnimationFrame(tick);
}

function endTurn(completed) {
  if (!turnActive) return;
  turnActive = false;
  clearInterval(timerInterval);
  cancelAnimationFrame(animFrameId);

  const elapsed = completed ? capSeconds - remainingSeconds : capSeconds;
  players[currentPlayerIndex].pairsFound = pairsFound;
  players[currentPlayerIndex].elapsedSeconds = elapsed;
  players[currentPlayerIndex].completed = completed;

  showTurnResult(completed, elapsed);
}

// ---------------------------------------------------------------------
// Click / matching logic
// ---------------------------------------------------------------------

function onTileClick(tile) {
  if (!turnActive || tile.matched) return;

  if (!selectedTile) {
    selectedTile = tile;
    tile.el.classList.add("selected");
    return;
  }

  if (selectedTile === tile) {
    tile.el.classList.remove("selected");
    selectedTile = null;
    return;
  }

  if (selectedTile.type !== tile.type && selectedTile.pairId === tile.pairId) {
    // Match!
    [selectedTile, tile].forEach((t) => {
      t.matched = true;
      t.el.classList.remove("selected");
      t.el.classList.add("matched-out");
    });
    pairsFound += 1;
    renderProgress();
    selectedTile = null;

    if (pairsFound === ALL_BOOKS.length) {
      endTurn(true);
    }
  } else {
    // Mismatch — brief red flash, then deselect both.
    const prevSelected = selectedTile;
    tile.el.classList.add("wrong-flash");
    prevSelected.el.classList.add("wrong-flash");
    setTimeout(() => {
      tile.el.classList.remove("wrong-flash");
      prevSelected.el.classList.remove("wrong-flash", "selected");
    }, 350);
    selectedTile = null;
  }
}

// ---------------------------------------------------------------------
// Rendering: HUD
// ---------------------------------------------------------------------

function renderProgress() {
  document.getElementById("drill-progress").textContent = `${pairsFound} / ${ALL_BOOKS.length}`;
}

function renderTimer() {
  const el = document.getElementById("drill-timer");
  el.textContent = remainingSeconds;
  el.classList.toggle("low-time", remainingSeconds <= 10 && remainingSeconds > 0);
}

// ---------------------------------------------------------------------
// Turn result modal
// ---------------------------------------------------------------------

const turnResultModal = document.getElementById("drill-turn-result-modal");
const turnResultHeadline = document.getElementById("drill-turn-result-headline");
const turnResultDetail = document.getElementById("drill-turn-result-detail");
const turnResultNextBtn = document.getElementById("drill-turn-result-next-btn");

function showTurnResult(completed, elapsed) {
  const p = players[currentPlayerIndex];
  turnResultHeadline.textContent = completed
    ? `All 16 pairs in ${elapsed}s!`
    : `Time's up — ${p.pairsFound} / ${ALL_BOOKS.length} pairs`;
  turnResultDetail.textContent = completed
    ? `Nice work, ${p.name}!`
    : `Good effort, ${p.name} — on to the next player.`;

  const isLastPlayer = currentPlayerIndex === players.length - 1;
  turnResultNextBtn.textContent = isLastPlayer ? "See Final Results" : "Next Player";
  turnResultModal.classList.remove("hidden");
}

turnResultNextBtn.addEventListener("click", () => {
  turnResultModal.classList.add("hidden");
  if (currentPlayerIndex === players.length - 1) {
    showLeaderboard();
  } else {
    currentPlayerIndex += 1;
    showReadyScreen();
  }
});

// ---------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------

const leaderboardModal = document.getElementById("drill-leaderboard-modal");
const leaderboardList = document.getElementById("drill-leaderboard-list");
const playAgainBtn = document.getElementById("drill-play-again-btn");
const newGameBtn = document.getElementById("drill-new-game-btn");

function showLeaderboard() {
  const ranked = [...players].sort((a, b) => {
    if (b.pairsFound !== a.pairsFound) return b.pairsFound - a.pairsFound;
    return a.elapsedSeconds - b.elapsedSeconds;
  });

  leaderboardList.innerHTML = ranked
    .map((p, idx) => {
      const detail = p.completed
        ? `All 16 pairs in ${p.elapsedSeconds}s`
        : `${p.pairsFound} / ${ALL_BOOKS.length} pairs (time ran out)`;
      return `<div class="drill-leaderboard-row">
        <div><span class="rank">#${idx + 1}</span>${escapeHtml(p.name)}</div>
        <div class="details">${detail}</div>
      </div>`;
    })
    .join("");

  gameScreen.classList.add("hidden");
  leaderboardModal.classList.remove("hidden");
}

playAgainBtn.addEventListener("click", () => {
  players.forEach((p) => { p.pairsFound = 0; p.elapsedSeconds = 0; p.completed = false; });
  currentPlayerIndex = 0;
  leaderboardModal.classList.add("hidden");
  showReadyScreen();
});

newGameBtn.addEventListener("click", () => {
  leaderboardModal.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});

document.querySelector("#drill-turn-result-modal .modal-backdrop").addEventListener("click", () => {});
document.querySelector("#drill-leaderboard-modal .modal-backdrop").addEventListener("click", () => {});

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
