// straightup.js — Straight-Up Battle
//
// Matches the official State Battle of the Books rules where practical
// for a host-run, single-device scoring tool:
//   - 2 pts for the correct title, +1 bonus for the author (only if the
//     title was already correct) — Rule 6.
//   - A miss rebounds to the other team for 2 pts, title only, no author
//     bonus on a rebound — Rule 7.
//   - 20 seconds to start an answer once a question is up; 10 seconds on
//     a rebound — Rule 5 / Rule 7. Timers auto-advance if time runs out,
//     but a host click at any time overrides the timer immediately.
//   - A round is a fixed number of questions — 6, 8, or 12 depending on
//     level (Rule 3); which team is "up" alternates strictly every new
//     question regardless of outcome (Rule 2), and the round ends
//     automatically once that many questions have been played.
//   - A tie at the end of a round goes to a 12-question tiebreaker round
//     with scores reset to zero, repeating until someone wins (Rule 20).
//
// What's intentionally NOT modeled: individual team rosters and the
// specific player-by-player answering order (Rules 1, 5, 7 reference a
// specific "team member" and rotating them in sequence) — this tool
// scores team vs. team only. Also not modeled: multi-team round-robin
// tournament standings (Rule 8) — this is a single 2-team match at a
// time.

const INITIAL_ANSWER_SECONDS = 20;
const REBOUND_SECONDS = 10;
const TIEBREAKER_LENGTH = 12;

let pool = [];
let poolCursor = 0;
let teams = [];
let upTeamIndex = 0;
let currentQuestion = null;
let questionsAsked = 0;
let roundLength = 12;
let timerInterval = null;

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
  roundLength = Number(document.getElementById("su-round-length").value) || 12;
  upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  questionsAsked = 0;

  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  await beginRound();
});

async function beginRound() {
  document.getElementById("su-next-btn").textContent = "Loading questions…";
  document.getElementById("su-next-btn").disabled = true;
  pool = await loadCombinedPool();
  poolCursor = 0;
  document.getElementById("su-next-btn").textContent = "Next Question";
  document.getElementById("su-next-btn").disabled = false;
  document.getElementById("su-clue-text").textContent = 'Click "Next Question" to draw a clue.';
  document.getElementById("su-clue-category").textContent = "";
  resetStages();

  renderScoreboard();
  renderUpIndicator();
  renderQuestionCount();
}

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
  document.getElementById("su-question-count").textContent = `Question ${Math.min(questionsAsked, roundLength)} of ${roundLength}`;
}

function resetStages() {
  ["su-stage-title", "su-stage-author", "su-stage-steal"].forEach((id) =>
    document.getElementById(id).classList.add("hidden")
  );
  document.getElementById("su-answer-block").classList.add("hidden");
  clearTimer();
}

// ---------------------------------------------------------------------
// Timers (Rule 5: 20s to start an answer; Rule 7: 10s on a rebound)
// ---------------------------------------------------------------------

function clearTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(seconds, displayElId, onExpire) {
  clearTimer();
  let remaining = seconds;
  const el = document.getElementById(displayElId);
  const render = () => {
    el.textContent = `⏱ ${remaining}s`;
    el.classList.toggle("low-time", remaining <= 5);
  };
  render();
  timerInterval = setInterval(() => {
    remaining -= 1;
    render();
    if (remaining <= 0) {
      clearTimer();
      onExpire();
    }
  }, 1000);
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

  startTimer(INITIAL_ANSWER_SECONDS, "su-title-timer", () => {
    // Time expired with no decision — treat as incorrect, move to rebound.
    onTitleWrong();
  });
});

document.getElementById("su-speak-btn").addEventListener("click", () => {
  if (currentQuestion) speak(currentQuestion.clue);
});

document.getElementById("su-title-correct-btn").addEventListener("click", () => {
  clearTimer();
  onTitleCorrect();
});
document.getElementById("su-title-wrong-btn").addEventListener("click", () => {
  clearTimer();
  onTitleWrong();
});

function onTitleCorrect() {
  teams[upTeamIndex].score += 2;
  renderScoreboard();
  document.getElementById("su-stage-title").classList.add("hidden");
  document.getElementById("su-stage-author").classList.remove("hidden");
}

function onTitleWrong() {
  const otherIndex = upTeamIndex === 0 ? 1 : 0;
  document.getElementById("su-stage-steal-team").textContent = teams[otherIndex].name;
  document.getElementById("su-stage-title").classList.add("hidden");
  document.getElementById("su-stage-steal").classList.remove("hidden");

  startTimer(REBOUND_SECONDS, "su-steal-timer", () => {
    onStealWrong();
  });
}

document.getElementById("su-author-correct-btn").addEventListener("click", () => {
  teams[upTeamIndex].score += 1;
  renderScoreboard();
  finishQuestion();
});
document.getElementById("su-author-wrong-btn").addEventListener("click", () => {
  finishQuestion();
});

document.getElementById("su-steal-correct-btn").addEventListener("click", () => {
  clearTimer();
  onStealCorrect();
});
document.getElementById("su-steal-wrong-btn").addEventListener("click", () => {
  clearTimer();
  onStealWrong();
});

function onStealCorrect() {
  const otherIndex = upTeamIndex === 0 ? 1 : 0;
  teams[otherIndex].score += 2;
  renderScoreboard();
  finishQuestion();
}
function onStealWrong() {
  finishQuestion();
}

function finishQuestion() {
  clearTimer();
  document.getElementById("su-answer-block").classList.remove("hidden");
  ["su-stage-title", "su-stage-author", "su-stage-steal"].forEach((id) =>
    document.getElementById(id).classList.add("hidden")
  );
  upTeamIndex = upTeamIndex === 0 ? 1 : 0;
  renderUpIndicator();
  renderScoreboard();

  if (questionsAsked >= roundLength) {
    showResults();
  } else {
    document.getElementById("su-next-btn").disabled = false;
  }
}

// ---------------------------------------------------------------------
// Match / round end
// ---------------------------------------------------------------------

document.getElementById("su-end-btn").addEventListener("click", () => {
  if (!confirm("End this round now and see the results?")) return;
  showResults();
});

function showResults() {
  clearTimer();
  matchScreen.classList.add("hidden");
  resultsScreen.classList.remove("hidden");

  const [a, b] = teams;
  const tiebreakerBtn = document.getElementById("su-tiebreaker-btn");
  let headline;
  if (a.score === b.score) {
    headline = `It's a tie! ${a.score} — ${b.score}`;
    tiebreakerBtn.classList.remove("hidden");
  } else {
    const winner = a.score > b.score ? a : b;
    headline = `${winner.name} wins!`;
    tiebreakerBtn.classList.add("hidden");
  }
  document.getElementById("su-results-headline").textContent = headline;
  document.getElementById("su-results-detail").textContent =
    `Final score — ${a.name}: ${a.score}, ${b.name}: ${b.score}, over ${questionsAsked} question${questionsAsked === 1 ? "" : "s"}.`;
}

document.getElementById("su-tiebreaker-btn").addEventListener("click", async () => {
  // Rule 20: tiebreaker is always 12 questions, scores reset to zero.
  teams.forEach((t) => (t.score = 0));
  roundLength = TIEBREAKER_LENGTH;
  upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  questionsAsked = 0;
  resultsScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  await beginRound();
});

document.getElementById("su-rematch-btn").addEventListener("click", async () => {
  teams.forEach((t) => (t.score = 0));
  upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  questionsAsked = 0;
  resultsScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  await beginRound();
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
