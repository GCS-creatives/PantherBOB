// netlify/functions/questions.js
//
// Backend for the Panther Bob Quiz question bank.
// Storage: Netlify Blobs (a key-value store tied to this Netlify site — no
// separate database needed). The whole bank is kept under one key, "bank",
// as a JSON array. On first request ever, if the store is empty, it's
// seeded from data/seed-questions.json (the 80 starter questions).
//
// Endpoints (all via /api/questions, redirected in netlify.toml):
//   GET    /api/questions          -> returns the full bank as JSON
//   POST   /api/questions          -> body: a single question object OR an
//                                     array of question objects; appends them
//   DELETE /api/questions          -> body: { "id": "<question id>" }; removes one

const { getStore, connectLambda } = require("@netlify/blobs");
const seedQuestions = require("../../data/seed-questions.json");

const KEY = "bank";
const STORE_NAME = "panther-bob-questions";
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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function makeId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateQuestion(q) {
  const errors = [];
  if (!q || typeof q !== "object") errors.push("Question must be an object.");
  if (!q.category || !VALID_CATEGORIES.includes(q.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  const pts = Number(q.points);
  if (!VALID_POINTS.includes(pts)) {
    errors.push(`points must be one of: ${VALID_POINTS.join(", ")}`);
  }
  if (!q.clue || typeof q.clue !== "string" || !q.clue.trim()) {
    errors.push("clue is required.");
  }
  if (!q.answerTitle || typeof q.answerTitle !== "string" || !q.answerTitle.trim()) {
    errors.push("answerTitle is required.");
  }
  if (!q.answerAuthor || typeof q.answerAuthor !== "string" || !q.answerAuthor.trim()) {
    errors.push("answerAuthor is required.");
  }
  return errors;
}

exports.handler = async (event) => {
  connectLambda(event); // required so getStore() can find Netlify's Blobs context

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const store = getStore(STORE_NAME);

  try {
    if (event.httpMethod === "GET") {
      let bank = await store.get(KEY, { type: "json" });
      if (!bank) {
        bank = seedQuestions;
        await store.setJSON(KEY, bank);
      }
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(bank) };
    }

    if (event.httpMethod === "POST") {
      let incoming;
      try {
        incoming = JSON.parse(event.body || "[]");
      } catch (e) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Body must be valid JSON." }),
        };
      }
      const toAdd = Array.isArray(incoming) ? incoming : [incoming];

      const allErrors = [];
      toAdd.forEach((q, i) => {
        const errs = validateQuestion(q);
        if (errs.length) allErrors.push({ index: i, errors: errs });
      });
      if (allErrors.length) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Validation failed.", details: allErrors }),
        };
      }

      let bank = await store.get(KEY, { type: "json" });
      if (!bank) bank = seedQuestions;

      const withIds = toAdd.map((q) => ({
        id: q.id && typeof q.id === "string" ? q.id : makeId(),
        category: q.category,
        points: Number(q.points),
        clue: q.clue.trim(),
        answerTitle: q.answerTitle.trim(),
        answerAuthor: q.answerAuthor.trim(),
      }));

      bank = [...bank, ...withIds];
      await store.setJSON(KEY, bank);

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ added: withIds.length, total: bank.length, questions: withIds }),
      };
    }

    if (event.httpMethod === "DELETE") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Body must be valid JSON." }),
        };
      }
      if (!body.id) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "id is required." }),
        };
      }
      let bank = await store.get(KEY, { type: "json" });
      if (!bank) bank = seedQuestions;
      const before = bank.length;
      bank = bank.filter((q) => q.id !== body.id);
      await store.setJSON(KEY, bank);
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ removed: before - bank.length, total: bank.length }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method not allowed." }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server error.", message: String(err && err.message || err) }),
    };
  }
};
