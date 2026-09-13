// mystery.js — Mystery Book (20 Questions)
//
// One host holds a secret book on this screen. Everyone else asks
// yes/no questions (out loud) to narrow it down within 20 questions.
// The host answers verbally based on what they know about the book —
// this tool just tracks the secret, the question count, and guesses.

const MAX_QUESTIONS = 20;
const MYSTERY_USED_KEY = "pbq_mystery_used_titles_v1";

let ALL_BOOKS = [];
let secretBook = null;
let questionCount = 0;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadBooks() {
  const res = await fetch("./data/books.json");
  return res.json();
}

function getUsedTitles() {
  try {
    return JSON.parse(localStorage.getItem(MYSTERY_USED_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveUsedTitles(list) {
  localStorage.setItem(MYSTERY_USED_KEY, JSON.stringify(list));
}

function pickSecretBook() {
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

const introScreen = document.getElementById("mystery-intro-screen");
const gameScreen = document.getElementById("mystery-game-screen");
const secretBlur = document.getElementById("mystery-secret-blur");

function startNewMystery() {
  secretBook = pickSecretBook();
  questionCount = 0;
  document.getElementById("mystery-secret-title").textContent = secretBook.title;
  document.getElementById("mystery-secret-author").textContent = secretBook.author;
  document.getElementById("mystery-count").textContent = "0";
  document.getElementById("mystery-guess-block").classList.add("hidden");
  document.getElementById("mystery-result").classList.add("hidden");
  document.getElementById("mystery-new-btn").classList.add("hidden");
  document.getElementById("mystery-ask-btn").disabled = false;
  document.getElementById("mystery-guess-btn").disabled = false;
  document.getElementById("mystery-giveup-btn").disabled = false;
  secretBlur.classList.remove("hidden-content");

  introScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
}

document.getElementById("mystery-start-btn").addEventListener("click", startNewMystery);
document.getElementById("mystery-new-btn").addEventListener("click", startNewMystery);

document.getElementById("mystery-toggle-btn").addEventListener("click", () => {
  secretBlur.classList.toggle("hidden-content");
});

document.getElementById("mystery-ask-btn").addEventListener("click", () => {
  if (questionCount >= MAX_QUESTIONS) return;
  questionCount += 1;
  document.getElementById("mystery-count").textContent = questionCount;
  if (questionCount >= MAX_QUESTIONS) {
    endMystery(false);
  }
});

document.getElementById("mystery-guess-btn").addEventListener("click", () => {
  document.getElementById("mystery-guess-block").classList.remove("hidden");
});

document.getElementById("mystery-guess-correct-btn").addEventListener("click", () => {
  document.getElementById("mystery-guess-block").classList.add("hidden");
  endMystery(true);
});
document.getElementById("mystery-guess-wrong-btn").addEventListener("click", () => {
  document.getElementById("mystery-guess-block").classList.add("hidden");
});

document.getElementById("mystery-giveup-btn").addEventListener("click", () => {
  endMystery(false);
});

function endMystery(guessedCorrectly) {
  const resultEl = document.getElementById("mystery-result");
  secretBlur.classList.remove("hidden-content");
  document.getElementById("mystery-ask-btn").disabled = true;
  document.getElementById("mystery-guess-btn").disabled = true;
  document.getElementById("mystery-giveup-btn").disabled = true;
  document.getElementById("mystery-guess-block").classList.add("hidden");

  resultEl.textContent = guessedCorrectly
    ? `Solved it in ${questionCount} question${questionCount === 1 ? "" : "s"}! It was "${secretBook.title}" by ${secretBook.author}.`
    : `The secret book was "${secretBook.title}" by ${secretBook.author}.`;
  resultEl.classList.remove("hidden");
  document.getElementById("mystery-new-btn").classList.remove("hidden");
}

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  ALL_BOOKS = await loadBooks();
})();
