// landing.js — Panther Bob Games home page
//
// To add a new game later: add one object to GAMES below (point `href` at
// its HTML page) — the card grid renders itself from this list, nothing
// else on this page needs to change. Give the new page the same header
// nav pattern as the others (🏠 All Games + Manage Questions).
//
// RESOURCES works the same way for non-game reference material. Set
// `external: true` and point `href` at a full URL for a link that leaves
// the site (opens in a new tab); omit it for an internal page like the
// games use.

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
  {
    name: "Wheel of Fortune",
    emoji: "🎡",
    description: "Spin the wheel, then guess letters to fill in the title. No author clue — just the puzzle. 1–5 players.",
    href: "wheel.html",
  },
  {
    name: "Crossword",
    emoji: "✏️",
    description: "Solo practice — author is the clue, book title is the answer. 4 short rounds cover all 16 books.",
    href: "crossword.html",
  },
];

const RESOURCES = [
  {
    name: "Author Pronunciations",
    emoji: "🔊",
    description: "Hear each of the 16 authors' names read aloud.",
    href: "authors.html",
    buttonLabel: "Open",
  },
  {
    name: "TeachingBooks Pronunciation Guide",
    emoji: "🎓",
    description: "Professionally recorded author name pronunciations, browsable by last name. May require a TeachingBooks sign-in.",
    href: "https://school.teachingbooks.net/pronunciations.cgi",
    buttonLabel: "Visit Site ↗",
    external: true,
  },
];

function renderGameCards() {
  const grid = document.getElementById("game-picker-grid");
  grid.innerHTML = GAMES.map(cardHtml).join("");

  const resourceGrid = document.getElementById("resource-picker-grid");
  if (resourceGrid) resourceGrid.innerHTML = RESOURCES.map(cardHtml).join("");
}

function cardHtml(g) {
  const label = g.buttonLabel || "Play";
  const targetAttr = g.external ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `
    <a class="game-card" href="${g.href}"${targetAttr}>
      <div class="game-emoji">${g.emoji}</div>
      <div class="game-name">${escapeHtml(g.name)}</div>
      <div class="game-desc">${escapeHtml(g.description)}</div>
      <div class="game-play-btn">${label}</div>
    </a>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

document.getElementById("copyright-year").textContent = new Date().getFullYear();
renderGameCards();
