// straightup-online.js — Straight-Up Battle Online
//
// No websockets here — Netlify Functions can't push updates, so this
// polls GET /api/battle-room?code=XXXX every 3 seconds and re-renders
// from whatever the server currently says. The host is just the one
// browser that holds a hostToken (handed back once at room creation,
// stored in sessionStorage) — every scoring action is a POST carrying
// that token, and the server rejects any action without a matching one.
// Spectators poll the exact same endpoint, read-only.
//
// Countdown timers (20s to start an answer, 10s on a rebound) are
// re-derived locally by every viewer from the server's `stageStartedAt`
// timestamp, so everyone's clock agrees regardless of poll timing. Only
// the host's browser is allowed to act when a timer hits zero (auto
// "wrong" / "no rebound"), exactly mirroring a manual click.

const POLL_MS = 3000;
const INITIAL_ANSWER_SECONDS = 20;
const REBOUND_SECONDS = 10;

let roomCode = null;
let hostToken = null;
let isHost = false;
let lastState = null;
let pollInterval = null;
let tickInterval = null;
let expiredForStageStart = null; // dedupe: only auto-fire once per stage

// ---------------------------------------------------------------------
// Screen switching
// ---------------------------------------------------------------------

const screens = {
  choice: document.getElementById("suo-choice-screen"),
  hostSetup: document.getElementById("suo-host-setup-screen"),
  code: document.getElementById("suo-code-screen"),
  join: document.getElementById("suo-join-screen"),
  match: document.getElementById("suo-match-screen"),
  results: document.getElementById("suo-results-screen"),
};
function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

document.getElementById("suo-show-host-btn").addEventListener("click", () => showScreen("hostSetup"));
document.getElementById("suo-show-join-btn").addEventListener("click", () => showScreen("join"));
document.getElementById("suo-back-from-host-btn").addEventListener("click", () => showScreen("choice"));
document.getElementById("suo-back-from-join-btn").addEventListener("click", () => showScreen("choice"));

// ---------------------------------------------------------------------
// Host: create room
// ---------------------------------------------------------------------

document.getElementById("suo-create-btn").addEventListener("click", async () => {
  const teamAName = document.getElementById("suo-team-a-name").value.trim() || "Team A";
  const teamBName = document.getElementById("suo-team-b-name").value.trim() || "Team B";
  const roundLength = Number(document.getElementById("suo-round-length").value);

  const btn = document.getElementById("suo-create-btn");
  btn.disabled = true;
  btn.textContent = "Creating…";
  try {
    const res = await fetch("/api/battle-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", teamAName, teamBName, roundLength }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create room.");

    roomCode = data.code;
    hostToken = data.hostToken;
    isHost = true;
    sessionStorage.setItem(`pbq_battle_host_${roomCode}`, hostToken);
    lastState = data.state;

    document.getElementById("suo-room-code-display").textContent = roomCode;
    showScreen("code");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Room";
  }
});

document.getElementById("suo-copy-code-btn").addEventListener("click", () => {
  navigator.clipboard?.writeText(roomCode).then(() => {
    const btn = document.getElementById("suo-copy-code-btn");
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = original), 1500);
  });
});

document.getElementById("suo-enter-match-btn").addEventListener("click", () => {
  enterMatchScreen();
});

// ---------------------------------------------------------------------
// Join room
// ---------------------------------------------------------------------

document.getElementById("suo-join-btn").addEventListener("click", async () => {
  const code = document.getElementById("suo-join-code-input").value.trim().toUpperCase();
  const errorEl = document.getElementById("suo-join-error");
  errorEl.textContent = "";
  if (!code) return;

  try {
    const res = await fetch("/api/battle-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Room not found.");

    roomCode = code;
    hostToken = sessionStorage.getItem(`pbq_battle_host_${roomCode}`) || null;
    isHost = !!hostToken;
    lastState = data;
    enterMatchScreen();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------------------------------------------------------------------
// Match screen
// ---------------------------------------------------------------------

function enterMatchScreen() {
  document.getElementById("suo-active-code").textContent = roomCode;
  document.getElementById("suo-host-badge").classList.toggle("hidden", !isHost);
  document.getElementById("suo-host-controls").classList.toggle("hidden", !isHost);
  document.getElementById("suo-spectator-note").classList.toggle("hidden", isHost);
  document.getElementById("suo-speak-btn").classList.remove("hidden");

  showScreen("match");
  renderState(lastState);
  startPolling();
  startTicker();
}

function startPolling() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/battle-room?code=${encodeURIComponent(roomCode)}`);
      if (!res.ok) return;
      const state = await res.json();
      lastState = state;
      renderState(state);
    } catch (e) {
      // Transient network hiccup — next poll will retry.
    }
  }, POLL_MS);
}

function startTicker() {
  clearInterval(tickInterval);
  tickInterval = setInterval(tick, 1000);
}

function tick() {
  if (!lastState || !lastState.stageStartedAt) return;
  const { stage, stageStartedAt } = lastState;
  let limit = null;
  let timerElId = null;
  if (stage === "await-title") { limit = INITIAL_ANSWER_SECONDS; timerElId = "suo-title-timer"; }
  else if (stage === "await-steal") { limit = REBOUND_SECONDS; timerElId = "suo-steal-timer"; }
  if (limit === null) return;

  const elapsed = Math.floor((Date.now() - stageStartedAt) / 1000);
  const remaining = Math.max(0, limit - elapsed);
  const el = document.getElementById(timerElId);
  if (el) {
    el.textContent = `⏱ ${remaining}s`;
    el.classList.toggle("low-time", remaining <= 5 && remaining > 0);
  }

  if (remaining <= 0 && isHost && expiredForStageStart !== stageStartedAt) {
    expiredForStageStart = stageStartedAt;
    const event = stage === "await-title" ? "title-wrong" : "steal-wrong";
    sendScoreEvent(event);
  }
}

function renderState(state) {
  if (!state) return;

  // Keep every viewer's visible screen in sync with the server's
  // `finished` flag, not just the host's own button clicks — otherwise
  // a spectator left on the results screen would never see a
  // rematch/tiebreaker start back up once the host begins one.
  showScreen(state.finished ? "results" : "match");

  // Scoreboard
  const scoreEl = document.getElementById("suo-scoreboard");
  scoreEl.innerHTML = state.teams
    .map(
      (t, idx) =>
        `<div class="score-card${idx === state.upTeamIndex && !state.finished ? " active-turn" : ""}"><div class="score-name">${escapeHtml(t.name)}</div><div class="score-value">${t.score}</div></div>`
    )
    .join("");

  if (state.finished) {
    showResults(state);
    return;
  }

  document.getElementById("suo-up-indicator").textContent = `${state.teams[state.upTeamIndex].name} is up`;
  document.getElementById("suo-question-count").textContent = `Question ${Math.min(state.questionsAsked, state.roundLength)} of ${state.roundLength}`;

  const hasQuestion = !!state.currentQuestion && state.stage !== "idle";
  document.getElementById("suo-clue-category").textContent = hasQuestion ? state.currentQuestion.category || "" : "";
  document.getElementById("suo-clue-text").textContent = hasQuestion
    ? state.currentQuestion.clue
    : "Waiting for the host to draw a question…";

  const showAnswer = state.stage === "idle" && state.currentQuestion && state.questionsAsked > 0;
  // Only show the answer block right after a question resolves, not before the first draw.
  document.getElementById("suo-answer-block").classList.toggle("hidden", !showAnswer);
  if (showAnswer) {
    document.getElementById("suo-answer").textContent = `${state.currentQuestion.answerTitle} — ${state.currentQuestion.answerAuthor}`;
  }

  // Host-only stage panels
  if (isHost) {
    document.getElementById("suo-stage-title").classList.toggle("hidden", state.stage !== "await-title");
    document.getElementById("suo-stage-author").classList.toggle("hidden", state.stage !== "await-author");
    document.getElementById("suo-stage-steal").classList.toggle("hidden", state.stage !== "await-steal");
    document.getElementById("suo-stage-title-team").textContent = state.teams[state.upTeamIndex].name;
    const otherIdx = state.upTeamIndex === 0 ? 1 : 0;
    document.getElementById("suo-stage-steal-team").textContent = state.teams[otherIdx].name;
    document.getElementById("suo-draw-btn").disabled = state.stage !== "idle";
  }
}

document.getElementById("suo-speak-btn").addEventListener("click", () => {
  if (lastState && lastState.currentQuestion && lastState.stage !== "idle") {
    speak(lastState.currentQuestion.clue);
  }
});

// ---------------------------------------------------------------------
// Host actions
// ---------------------------------------------------------------------

async function postAction(payload) {
  const res = await fetch("/api/battle-room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: roomCode, hostToken, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Action failed.");
  lastState = data;
  expiredForStageStart = null;
  renderState(data);
  return data;
}

document.getElementById("suo-draw-btn").addEventListener("click", async () => {
  try {
    await postAction({ action: "draw" });
  } catch (err) {
    alert(err.message);
  }
});

function sendScoreEvent(event) {
  postAction({ action: "score", event }).catch((err) => alert(err.message));
}

document.getElementById("suo-title-correct-btn").addEventListener("click", () => sendScoreEvent("title-correct"));
document.getElementById("suo-title-wrong-btn").addEventListener("click", () => sendScoreEvent("title-wrong"));
document.getElementById("suo-author-correct-btn").addEventListener("click", () => sendScoreEvent("author-correct"));
document.getElementById("suo-author-wrong-btn").addEventListener("click", () => sendScoreEvent("author-wrong"));
document.getElementById("suo-steal-correct-btn").addEventListener("click", () => sendScoreEvent("steal-correct"));
document.getElementById("suo-steal-wrong-btn").addEventListener("click", () => sendScoreEvent("steal-wrong"));

document.getElementById("suo-end-btn").addEventListener("click", async () => {
  if (!confirm("End this match now and show results to everyone?")) return;
  try {
    await postAction({ action: "end" });
  } catch (err) {
    alert(err.message);
  }
});

// ---------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------

function showResults(state) {
  showScreen("results");
  document.getElementById("suo-results-headline").textContent = state.resultHeadline || "Match complete!";
  const [a, b] = state.teams;
  document.getElementById("suo-results-detail").textContent =
    `Final score — ${a.name}: ${a.score}, ${b.name}: ${b.score}, over ${state.questionsAsked} question${state.questionsAsked === 1 ? "" : "s"}.`;

  const hostControls = document.getElementById("suo-host-results-controls");
  hostControls.classList.toggle("hidden", !isHost);
  document.getElementById("suo-tiebreaker-btn").classList.toggle("hidden", a.score !== b.score);
}

document.getElementById("suo-tiebreaker-btn").addEventListener("click", async () => {
  try {
    await postAction({ action: "tiebreaker" });
    showScreen("match");
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById("suo-rematch-btn").addEventListener("click", async () => {
  try {
    await postAction({ action: "rematch" });
    showScreen("match");
  } catch (err) {
    alert(err.message);
  }
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
