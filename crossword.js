// crossword.js — Panther Bob Crossword (solo practice)
//
// Reads precomputed layouts from data/crossword-rounds.json (built by
// scripts/generate-crosswords.js — not regenerated in the browser). Each
// of the 4 rounds covers 4 books; across all 4 rounds, every one of the
// 16 books appears exactly once.

let ROUNDS = [];
let roundIndex = 0;
let cellMap = new Map(); // "r,c" -> { letter, entries: [{clueNumber, dir}] }
let entryCells = {};     // clueNumber -> [{r,c}, ...] in order
let activeClue = null;   // { clueNumber, dir }

async function loadRounds() {
  const res = await fetch("./data/crossword-rounds.json");
  return res.json();
}

function buildLookups(round) {
  cellMap = new Map();
  entryCells = {};

  round.entries.forEach((e) => {
    const dr = e.dir === "down" ? 1 : 0;
    const dc = e.dir === "across" ? 1 : 0;
    const cells = [];
    for (let i = 0; i < e.answer.length; i++) {
      const r = e.row + dr * i;
      const c = e.col + dc * i;
      const key = `${r},${c}`;
      cells.push({ r, c });
      if (!cellMap.has(key)) {
        cellMap.set(key, { letter: e.answer[i], entries: [] });
      }
      cellMap.get(key).entries.push({ clueNumber: e.clueNumber, dir: e.dir, index: i });
    }
    entryCells[e.clueNumber] = cells;
  });
}

function renderRound() {
  const round = ROUNDS[roundIndex];
  buildLookups(round);
  document.getElementById("crossword-round-label").textContent = `Round ${roundIndex + 1} of ${ROUNDS.length}`;
  document.getElementById("crossword-check-result").textContent = "";

  renderGrid(round);
  renderClues(round);

  // Default active clue: the first one, across if available.
  const first = round.entries.slice().sort((a, b) => a.clueNumber - b.clueNumber)[0];
  setActiveClue(first.clueNumber, first.dir);

  const isLastRound = roundIndex === ROUNDS.length - 1;
  document.getElementById("crossword-next-btn").textContent = isLastRound ? "Finish" : "Next Round";
}

function renderGrid(round) {
  const grid = document.getElementById("crossword-grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${round.cols}, 30px)`;
  grid.style.gridTemplateRows = `repeat(${round.rows}, 30px)`;

  // Which cells are the start of which clue number(s)?
  const startNumbers = new Map(); // "r,c" -> clueNumber
  round.entries.forEach((e) => {
    startNumbers.set(`${e.row},${e.col}`, e.clueNumber);
  });

  for (let r = 0; r < round.rows; r++) {
    for (let c = 0; c < round.cols; c++) {
      const key = `${r},${c}`;
      const cellData = cellMap.get(key);
      const cellEl = document.createElement("div");

      if (!cellData) {
        cellEl.className = "crossword-cell spacer";
      } else {
        cellEl.className = "crossword-cell active";
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;

        const input = document.createElement("input");
        input.maxLength = 1;
        input.autocomplete = "off";
        input.dataset.row = r;
        input.dataset.col = c;
        cellEl.appendChild(input);

        if (startNumbers.has(key)) {
          const num = document.createElement("span");
          num.className = "crossword-clue-number";
          num.textContent = startNumbers.get(key);
          cellEl.appendChild(num);
        }

        input.addEventListener("focus", () => onCellFocus(r, c));
        input.addEventListener("keydown", (e) => onCellKeydown(e, r, c));
        input.addEventListener("input", (e) => onCellInput(e, r, c));
      }

      grid.appendChild(cellEl);
    }
  }
}

function renderClues(round) {
  const list = document.getElementById("crossword-clue-list");
  list.innerHTML = "";
  round.entries
    .slice()
    .sort((a, b) => a.clueNumber - b.clueNumber)
    .forEach((e) => {
      const li = document.createElement("li");
      li.dataset.clueNumber = e.clueNumber;
      li.dataset.dir = e.dir;
      li.innerHTML = `<strong>${e.clueNumber}${e.dir === "across" ? "A" : "D"}.</strong> ${escapeHtml(e.author)}
        <span class="clue-len">${e.answer.length} letters</span>`;
      li.addEventListener("click", () => {
        setActiveClue(e.clueNumber, e.dir);
        focusFirstCellOf(e.clueNumber);
      });
      list.appendChild(li);
    });
}

// ---------------------------------------------------------------------
// Active clue / highlighting
// ---------------------------------------------------------------------

function setActiveClue(clueNumber, dir) {
  activeClue = { clueNumber, dir };

  document.querySelectorAll(".crossword-cell.active").forEach((el) => el.classList.remove("highlighted"));
  (entryCells[clueNumber] || []).forEach(({ r, c }) => {
    const el = document.querySelector(`.crossword-cell[data-row="${r}"][data-col="${c}"]`);
    if (el) el.classList.add("highlighted");
  });

  document.querySelectorAll(".crossword-clues li").forEach((li) => {
    li.classList.toggle("active-clue", Number(li.dataset.clueNumber) === clueNumber);
  });
}

function focusFirstCellOf(clueNumber) {
  const cells = entryCells[clueNumber];
  if (!cells || !cells.length) return;
  const { r, c } = cells[0];
  const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
  if (input) input.focus();
}

// ---------------------------------------------------------------------
// Cell interaction
// ---------------------------------------------------------------------

function onCellFocus(r, c) {
  const key = `${r},${c}`;
  const cellData = cellMap.get(key);
  if (!cellData) return;

  // Prefer keeping the current direction if this cell belongs to it;
  // otherwise pick whichever entry is available here.
  let match = cellData.entries.find((en) => activeClue && en.dir === activeClue.dir);
  if (!match) match = cellData.entries[0];
  setActiveClue(match.clueNumber, match.dir);
}

function moveToNextCell(r, c, dir, delta) {
  const dr = dir === "down" ? delta : 0;
  const dc = dir === "across" ? delta : 0;
  const next = document.querySelector(`input[data-row="${r + dr}"][data-col="${c + dc}"]`);
  if (next) next.focus();
}

function onCellInput(e, r, c) {
  const val = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
  e.target.value = val.slice(-1);
  e.target.classList.remove("correct", "incorrect");
  if (val && activeClue) {
    moveToNextCell(r, c, activeClue.dir, 1);
  }
}

function onCellKeydown(e, r, c) {
  if (e.key === "Backspace" && !e.target.value && activeClue) {
    moveToNextCell(r, c, activeClue.dir, -1);
  } else if (e.key === "ArrowRight") {
    const next = document.querySelector(`input[data-row="${r}"][data-col="${c + 1}"]`);
    if (next) next.focus();
  } else if (e.key === "ArrowLeft") {
    const next = document.querySelector(`input[data-row="${r}"][data-col="${c - 1}"]`);
    if (next) next.focus();
  } else if (e.key === "ArrowDown") {
    const next = document.querySelector(`input[data-row="${r + 1}"][data-col="${c}"]`);
    if (next) next.focus();
  } else if (e.key === "ArrowUp") {
    const next = document.querySelector(`input[data-row="${r - 1}"][data-col="${c}"]`);
    if (next) next.focus();
  }
}

// ---------------------------------------------------------------------
// Check / Reveal
// ---------------------------------------------------------------------

document.getElementById("crossword-check-btn").addEventListener("click", () => {
  let total = 0, correct = 0, filled = 0;
  cellMap.forEach((data, key) => {
    const [r, c] = key.split(",");
    const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
    if (!input) return;
    total += 1;
    const val = input.value.toUpperCase();
    if (val) filled += 1;
    if (val === data.letter) {
      input.classList.add("correct");
      input.classList.remove("incorrect");
      if (val) correct += 1;
    } else if (val) {
      input.classList.add("incorrect");
      input.classList.remove("correct");
    }
  });
  document.getElementById("crossword-check-result").textContent =
    `${correct} / ${total} letters correct so far (${filled} filled in).`;
});

document.getElementById("crossword-reveal-btn").addEventListener("click", () => {
  if (!confirm("Reveal the full solution for this round?")) return;
  cellMap.forEach((data, key) => {
    const [r, c] = key.split(",");
    const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
    if (!input) return;
    input.value = data.letter;
    input.classList.add("correct");
    input.classList.remove("incorrect");
  });
});

// ---------------------------------------------------------------------
// Round progression
// ---------------------------------------------------------------------

document.getElementById("crossword-next-btn").addEventListener("click", () => {
  if (roundIndex < ROUNDS.length - 1) {
    roundIndex += 1;
    renderRound();
  } else {
    document.querySelector("#crossword-app .panel").classList.add("hidden");
    document.getElementById("crossword-complete-screen").classList.remove("hidden");
  }
});

document.getElementById("crossword-restart-btn").addEventListener("click", () => {
  roundIndex = 0;
  document.getElementById("crossword-complete-screen").classList.add("hidden");
  document.querySelector("#crossword-app .panel").classList.remove("hidden");
  renderRound();
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
  ROUNDS = await loadRounds();
  renderRound();
})();
