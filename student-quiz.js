// student-quiz.js — practice mode for approved student-submitted questions

let questions = [];
let currentIndex = 0;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadApproved() {
  const res = await fetch("/api/student-questions?status=approved");
  return res.json();
}

function showQuestion() {
  const q = questions[currentIndex];
  document.getElementById("sq-progress").textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  document.getElementById("sq-question").textContent = q.questionText;
  document.getElementById("sq-answer").textContent = `${q.bookTitle} — ${q.bookAuthor}`;
  document.getElementById("sq-credit").textContent = `Written by ${q.studentName}`;
  document.getElementById("sq-answer-block").classList.add("hidden");
  document.getElementById("sq-reveal-btn").classList.remove("hidden");
}

document.getElementById("sq-reveal-btn").addEventListener("click", () => {
  document.getElementById("sq-answer-block").classList.remove("hidden");
  document.getElementById("sq-reveal-btn").classList.add("hidden");
});

document.getElementById("sq-next-btn").addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % questions.length;
  showQuestion();
});

document.getElementById("sq-shuffle-btn").addEventListener("click", () => {
  questions = shuffle(questions);
  currentIndex = 0;
  showQuestion();
});

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  questions = shuffle(await loadApproved());

  if (questions.length === 0) {
    document.getElementById("sq-empty").classList.remove("hidden");
    return;
  }
  document.getElementById("sq-quiz-body").classList.remove("hidden");
  showQuestion();
})();
