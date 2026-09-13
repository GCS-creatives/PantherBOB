// netlify/functions/student-questions.js
//
// Student-submitted BOB-style questions ("In which book...? (p. X)").
// Everything starts as status "pending" and stays invisible to the
// practice mode and the board game until a teacher approves it.
//
//   GET    /api/student-questions?status=pending|approved|rejected|all
//   POST   /api/student-questions   body: one submission (see validate())
//   PATCH  /api/student-questions   body: { id, status, category?, points? }
//   DELETE /api/student-questions   body: { id }

const { getStore, connectLambda } = require("@netlify/blobs");

const STORE_NAME = "panther-bob-student-questions";
const KEY = "submissions";

const VALID_CATEGORIES = [
  "True Stories & Real Missions",
  "New Places, New Faces",
  "Hidden Histories & Family Secrets",
  "Grief & Getting Through It",
  "Danger & High Stakes",
  "Myth, Magic & the Unknown",
  "Second Chances & Reinvention",
  "Sports, Skills & Standing Out",
];
const VALID_POINTS = [100, 200, 300, 400, 500];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function makeId() {
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateSubmission(body) {
  const errors = [];
  if (!body.bookTitle || typeof body.bookTitle !== "string") errors.push("bookTitle is required.");
  if (!body.bookAuthor || typeof body.bookAuthor !== "string") errors.push("bookAuthor is required.");
  if (!body.questionMiddle || typeof body.questionMiddle !== "string" || !body.questionMiddle.trim()) {
    errors.push("Question text is required.");
  }
  const page = String(body.pageNumber || "").trim();
  if (!page || !/^\d+$/.test(page)) errors.push("Page number must be a whole number.");
  return errors;
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const store = getStore(STORE_NAME);

  try {
    if (event.httpMethod === "GET") {
      const all = (await store.get(KEY, { type: "json" })) || [];
      const status = (event.queryStringParameters || {}).status || "all";
      const filtered = status === "all" ? all : all.filter((s) => s.status === status);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(filtered) };
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Body must be valid JSON." }) };
      }

      const errors = validateSubmission(body);
      if (errors.length) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Validation failed.", details: errors }) };
      }

      const pageNumber = String(body.pageNumber).trim();
      const questionMiddle = body.questionMiddle.trim().replace(/\?+$/, "");
      const questionText = `In which book ${questionMiddle}? (p. ${pageNumber})`;

      const record = {
        id: makeId(),
        studentName: (body.studentName || "").trim() || "Anonymous",
        bookTitle: body.bookTitle,
        bookAuthor: body.bookAuthor,
        questionText,
        pageNumber,
        status: "pending",
        category: null,
        points: null,
        submittedAt: new Date().toISOString(),
      };

      const all = (await store.get(KEY, { type: "json" })) || [];
      all.push(record);
      await store.setJSON(KEY, all);

      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(record) };
    }

    if (event.httpMethod === "PATCH") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Body must be valid JSON." }) };
      }
      if (!body.id) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "id is required." }) };
      }
      if (!["pending", "approved", "rejected"].includes(body.status)) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "status must be pending, approved, or rejected." }) };
      }
      if (body.status === "approved") {
        if (!VALID_CATEGORIES.includes(body.category)) {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "A valid category is required to approve." }) };
        }
        if (!VALID_POINTS.includes(Number(body.points))) {
          return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "A valid points value is required to approve." }) };
        }
      }

      const all = (await store.get(KEY, { type: "json" })) || [];
      const idx = all.findIndex((s) => s.id === body.id);
      if (idx === -1) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Submission not found." }) };
      }

      all[idx].status = body.status;
      if (body.status === "approved") {
        all[idx].category = body.category;
        all[idx].points = Number(body.points);
      }
      await store.setJSON(KEY, all);

      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(all[idx]) };
    }

    if (event.httpMethod === "DELETE") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Body must be valid JSON." }) };
      }
      if (!body.id) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "id is required." }) };
      }
      const all = (await store.get(KEY, { type: "json" })) || [];
      const before = all.length;
      const remaining = all.filter((s) => s.id !== body.id);
      await store.setJSON(KEY, remaining);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ removed: before - remaining.length }) };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed." }) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server error.", message: String((err && err.message) || err) }),
    };
  }
};
