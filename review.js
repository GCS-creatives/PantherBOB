// review.js — teacher review queue for student-submitted questions

const CATEGORIES = [
  "True Stories & Real Missions",
  "New Places, New Faces",
  "Hidden Histories & Family Secrets",
  "Grief & Getting Through It",
  "Danger & High Stakes",
  "Myth, Magic & the Unknown",
  "Second Chances & Reinvention",
  "Sports, Skills & Standing Out",
];

async function refreshAll() {
  const res = await fetch("/api/student-questions?status=all");
  const all = await res.json();

  const pending = all.filter((s) => s.status === "pending");
  const approved = all.filter((s) => s.status === "approved");
  const rejected = all.filter((s) => s.status === "rejected");

  document.getElementById("pending-count").textContent = pending.length;
  renderPending(pending);
  renderApproved(approved);
  renderRejected(rejected);
}

function metaLine(s) {
  return `${escapeHtml(s.studentName)} · ${escapeHtml(s.bookTitle)} by ${escapeHtml(s.bookAuthor)} · p. ${escapeHtml(s.pageNumber)}`;
}

function renderPending(list) {
  const container = document.getElementById("pending-list");
  if (list.length === 0) {
    container.innerHTML = '<p class="review-empty">Nothing waiting for review.</p>';
    return;
  }
  container.innerHTML = list
    .map(
      (s) => `
    <div class="review-card" data-id="${escapeAttr(s.id)}">
      <div class="review-question">${escapeHtml(s.questionText)}</div>
      <div class="review-meta">${metaLine(s)}</div>
      <div class="review-actions">
        <select class="approve-category">
          ${CATEGORIES.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
        <select class="approve-points">
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="300" selected>300</option>
          <option value="400">400</option>
          <option value="500">500</option>
        </select>
        <button class="btn btn-primary approve-btn">Approve &amp; Add to Board</button>
        <button class="btn btn-ghost reject-btn">Reject</button>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => onApprove(e.target.closest(".review-card")));
  });
  container.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => onReject(e.target.closest(".review-card").dataset.id));
  });
}

function renderApproved(list) {
  const container = document.getElementById("approved-list");
  if (list.length === 0) {
    container.innerHTML = '<p class="review-empty">Nothing approved yet.</p>';
    return;
  }
  container.innerHTML = list
    .map(
      (s) => `
    <div class="review-card approved">
      <div class="review-question">${escapeHtml(s.questionText)}</div>
      <div class="review-meta">${metaLine(s)}</div>
      <span class="review-tag">${escapeHtml(s.category)} · ${s.points} pts</span>
    </div>
  `
    )
    .join("");
}

function renderRejected(list) {
  const container = document.getElementById("rejected-list");
  if (list.length === 0) {
    container.innerHTML = '<p class="review-empty">Nothing rejected.</p>';
    return;
  }
  container.innerHTML = list
    .map(
      (s) => `
    <div class="review-card rejected" data-id="${escapeAttr(s.id)}">
      <div class="review-question">${escapeHtml(s.questionText)}</div>
      <div class="review-meta">${metaLine(s)}</div>
      <div class="review-actions">
        <button class="btn btn-ghost delete-btn">Delete Permanently</button>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => onDelete(e.target.closest(".review-card").dataset.id));
  });
}

async function onApprove(card) {
  const id = card.dataset.id;
  const category = card.querySelector(".approve-category").value;
  const points = Number(card.querySelector(".approve-points").value);

  // Fetch the authoritative record rather than parsing it back out of the
  // rendered DOM — the DOM text is for display, this is for correctness.
  const res = await fetch("/api/student-questions?status=pending");
  const pending = await res.json();
  const record = pending.find((s) => s.id === id);
  if (!record) {
    alert("Couldn't find that submission anymore — refreshing the list.");
    refreshAll();
    return;
  }

  try {
    const patchRes = await fetch("/api/student-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved", category, points }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.json();
      throw new Error(err.error || "Could not approve.");
    }

    const boardRes = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        points,
        clue: record.questionText,
        answerTitle: record.bookTitle,
        answerAuthor: record.bookAuthor,
      }),
    });
    if (!boardRes.ok) {
      const err = await boardRes.json();
      alert(`Approved, but couldn't add it to the board game's question bank: ${err.error || "unknown error"}`);
    }
  } catch (err) {
    alert(`Error approving: ${err.message}`);
  }

  refreshAll();
}

async function onReject(id) {
  await fetch("/api/student-questions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "rejected" }),
  });
  refreshAll();
}

async function onDelete(id) {
  if (!confirm("Delete this rejected submission permanently?")) return;
  await fetch("/api/student-questions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  refreshAll();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

(async function init() {
  document.getElementById("copyright-year").textContent = new Date().getFullYear();
  await refreshAll();
})();
