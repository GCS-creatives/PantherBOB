// straightup.js — Straight-Up Battle
//
// Authentic 2-team Battle of the Books scoring: the team "up" gets 2
// points for the correct title, +1 more for the correct author. If they
// miss, the other team can steal for 2 points (title only, no author
// bonus on a steal). Which team is "up" alternates strictly every
// question, regardless of who scored — that's the real format, not
// "winner stays up".
//
// Questions are drawn from the combined pool: the live board-game bank
// (seed + anything added via Manage Questions) plus every teacher-
// approved student submission. Category/points from that bank aren't
// used for scoring here (Straight-Up Battle scoring is fixed), but the
// category is still shown for a little context.

let pool = [];       // shuffled queue of {clue, answerTitle, answerAuthor, category}
let poolCursor = 0;
let teams = [];       // [{ name, score }]
let upTeamIndex = 0;
let currentQuestion = null;
let questionsAsked = 0;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadCombinedPool() {
  const [boardRes, studentRes] = await Promise.all([
    fetch("/api/questions").catch(() => null),
    fetch("/api/student-questions?status=approved").catch(() => null),
  ]);

  let boardQuestions = [];
  let studentQuestions = [];
  try {
    boardQuestions = boardRes && boardRes.ok ? await boardRes.json() : [];
  } catch (e) {}
  try {
    studentQuestions = studentRes && studentRes.ok ? await studentRes.json() : [];
  } catch (e) {}

  const fromBoard = boardQuestions.map((q) => ({
    clue: q.clue,
    answerTitle: q.answerTitle,
    answerAuthor: q.answerAuthor,
    category: q.category,
  }));
  const fromStudents = studentQuestions.map((q) => ({
    clue: q.questionText,
    answerTitle: q.bookTitle,
    answerAuthor: q.bookAuthor,
    category: q.category,
  }));

  return shuffle([...fromBoard, ...fromStudents]);
}

function drawNextQuestion() {
  if (poolCursor >= pool.length) {
    pool = shuffle(pool);
    poolCursor = 0;
    document.getElementById("su-clue-category").textContent = "Question pool recycled — all questions have been used once.";
  }
  currentQuestion = pool[poolCursor];
  poolCursor += 1;
  questionsAsked += 1;
  return currentQuestion;
}

// ---------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------

const setupScreen = document.getElementById("su-setup-screen");
const matchScreen = document.getElementById("su-match-screen");
const resultsScreen = document.getElementById("su-results-screen");

document.getElementById("su-start-btn").addEventListener("click", async () => {
  const nameA = (document.getElementById("su-team-a-name").value || "Team A").trim();
  const nameB = (document.getElementById("su-team-b-name").value || "Team B").trim();
  teams = [
    { name: nameA, score: 0 },
    { name: nameB, score: 0 },
  ];
  upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  questionsAsked = 0;

  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");

  document.getElementById("su-next-btn").textContent = "Loading questions…";
  document.getElementById("su-next-btn").disabled = true;
  pool = await loadCombinedPool();
  poolCursor = 0;
  document.getElementById("su-next-btn").textContent = "Next Question";
  document.getElementById("su-next-btn").disabled = false;

  renderScoreboard();
  renderUpIndicator();
  renderQuestionCount();
});

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function renderScoreboard() {
  const el = document.getElementById("su-scoreboard");
  el.innerHTML = "";
  teams.forEach((t, idx) => {
    const card = document.createElement("div");
    card.className = "score-card" + (idx === upTeamIndex ? " active-turn" : "");
    card.innerHTML = `<div class="score-name">${escapeHtml(t.name)}</div><div class="score-value">${t.score}</div>`;
    el.appendChild(card);
  });
}

function renderUpIndicator() {
  document.getElementById("su-up-indicator").textContent = `${teams[upTeamIndex].name} is up`;
}

function renderQuestionCount() {
  document.getElementById("su-question-count").textContent = `Question ${questionsAsked}`;
}

function resetStages() {
  ["su-stage-title", "su-stage-author", "su-stage-steal"].forEach((id) =>
    document.getElementById(id).classList.add("hidden")
  );
  document.getElementById("su-answer-block").classList.add("hidden");
}

// ---------------------------------------------------------------------
// Question flow
// ---------------------------------------------------------------------

document.getElementById("su-next-btn").addEventListener("click", () => {
  const q = drawNextQuestion();
  document.getElementById("su-clue-category").textContent = q.category || "";
  document.getElementById("su-clue-text").textContent = q.clue;
  document.getElementById("su-answer").textContent = `${q.answerTitle} — ${q.answerAuthor}`;
  resetStages();
  renderQuestionCount();

  document.getElementById("su-stage-title-team").textContent = teams[upTeamIndex].name;
  document.getElementById("su-stage-title").classList.remove("hidden");
  document.getElementById("su-next-btn").disabled = true;
});

document.getElementById("su-title-correct-btn").addEventListener("click", () => {
  teams[upTeamIndex].score += 2;
  renderScoreboard();
  document.getElementById("su-stage-title").classList.add("hidden");
  document.getElementById("su-stage-author").classList.remove("hidden");
});

document.getElementById("su-title-wrong-btn").addEventListener("click", () => {
  const otherIndex = upTeamIndex === 0 ? 1 : 0;
  document.getElementById("su-stage-steal-team").textContent = teams[otherIndex].name;
  document.getElementById("su-stage-title").classList.add("hidden");
  document.getElementById("su-stage-steal").classList.remove("hidden");
});

document.getElementById("su-author-correct-btn").addEventListener("click", () => {
  teams[upTeamIndex].score += 1;
  renderScoreboard();
  finishQuestion();
});
document.getElementById("su-author-wrong-btn").addEventListener("click", () => {
  finishQuestion();
});

document.getElementById("su-steal-correct-btn").addEventListener("click", () => {
  const otherIndex = upTeamIndex === 0 ? 1 : 0;
  teams[otherIndex].score += 2;
  renderScoreboard();
  finishQuestion();
});
document.getElementById("su-steal-wrong-btn").addEventListener("click", () => {
  finishQuestion();
});

function finishQuestion() {
  document.getElementById("su-answer-block").classList.remove("hidden");
  ["su-stage-title", "su-stage-author", "su-stage-steal"].forEach((id) =>
    document.getElementById(id).classList.add("hidden")
  );
  upTeamIndex = upTeamIndex === 0 ? 1 : 0;
  renderUpIndicator();
  renderScoreboard();
  document.getElementById("su-next-btn").disabled = false;
}

// ---------------------------------------------------------------------
// Match end
// ---------------------------------------------------------------------

document.getElementById("su-end-btn").addEventListener("click", () => {
  if (!confirm("End this match now and see the results?")) return;
  showResults();
});

function showResults() {
  matchScreen.classList.add("hidden");
  resultsScreen.classList.remove("hidden");

  const [a, b] = teams;
  let headline;
  if (a.score === b.score) {
    headline = `It's a tie! ${a.score} — ${b.score}`;
  } else {
    const winner = a.score > b.score ? a : b;
    headline = `${winner.name} wins!`;
  }
  document.getElementById("su-results-headline").textContent = headline;
  document.getElementById("su-results-detail").textContent =
    `Final score — ${a.name}: ${a.score}, ${b.name}: ${b.score}, over ${questionsAsked} question${questionsAsked === 1 ? "" : "s"}.`;
}

document.getElementById("su-rematch-btn").addEventListener("click", async () => {
  teams.forEach((t) => (t.score = 0));
  upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  questionsAsked = 0;
  resultsScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");

  pool = await loadCombinedPool();
  poolCursor = 0;
  document.getElementById("su-clue-text").textContent = 'Click "Next Question" to draw a clue.';
  document.getElementById("su-clue-category").textContent = "";
  resetStages();
  renderScoreboard();
  renderUpIndicator();
  renderQuestionCount();
  document.getElementById("su-next-btn").disabled = false;
});

document.getElementById("su-new-match-btn").addEventListener("click", () => {
  resultsScreen.classList.add("hidden");
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

document.getElementById("copyright-year").textContent = new Date().getFullYear();
