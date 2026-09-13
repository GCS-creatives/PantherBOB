// landing.js — Panther Bob Games home page
//
// To add a new game later: add one object to GAMES below (point `href` at
// its HTML page) — the card grid renders itself from this list, nothing
// else on this page needs to change. Remember to also add nav links to
// the new page from the other games' headers, the way the existing pages
// link to each other.

const GAMES = [
  {
    name: "Jeopardy Board",
    emoji: "📋",
    description: "Classic trivia board — 5 categories, 5 difficulty tiers, host-judged. 1–5 players.",
    href: "board.html",
  },
  {
    name: "Memory Match",
    emoji: "🃏",
    description: "Flip cards to pair each book's title with its author. Two players, one timed round.",
    href: "match.html",
  },
  {
    name: "Speed Drill",
    emoji: "⚡",
    description: "Titles and authors bounce around the screen — click matching pairs before time runs out. 1–5 players.",
    href: "drill.html",
  },
];

function renderGameCards() {
  const grid = document.getElementById("game-picker-grid");
  grid.innerHTML = GAMES.map(
    (g) => `
    <a class="game-card" href="${g.href}">
      <div class="game-emoji">${g.emoji}</div>
      <div class="game-name">${escapeHtml(g.name)}</div>
      <div class="game-desc">${escapeHtml(g.description)}</div>
      <div class="game-play-btn">Play</div>
    </a>
  `
  ).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

document.getElementById("copyright-year").textContent = new Date().getFullYear();
renderGameCards();
