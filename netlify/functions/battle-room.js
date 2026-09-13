// netlify/functions/battle-room.js
//
// Backend for online Straight-Up Battle. There's no push/websocket
// support in Netlify Functions, so this is polling-based: the host's
// actions (create, draw, score, rematch) mutate a room's state in
// Netlify Blobs; every participant's browser (including the host's own)
// polls GET ?code=XXXX every few seconds to redraw from the latest
// state. Only the host can mutate a room, proven by a hostToken handed
// back once at room creation and never included in subsequent state
// reads.
//
// Scoring rules mirror the same-device version exactly (see
// straightup.js): 2 pts title, +1 author bonus (title must be correct
// first), a miss rebounds to the other team for 2 pts title-only, and
// which team is "up" alternates every question regardless of outcome.

const { getStore, connectLambda } = require("@netlify/blobs");

const ROOM_STORE = "panther-bob-battle-rooms";
const QUESTIONS_STORE = "panther-bob-questions";
const QUESTIONS_KEY = "bank";
const STUDENT_STORE = "panther-bob-student-questions";
const STUDENT_KEY = "submissions";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 confusion
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — rooms are single-session use

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}
function makeToken() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function loadCombinedPool() {
  const qStore = getStore(QUESTIONS_STORE);
  const sStore = getStore(STUDENT_STORE);
  const bank = (await qStore.get(QUESTIONS_KEY, { type: "json" })) || [];
  const submissions = (await sStore.get(STUDENT_KEY, { type: "json" })) || [];
  const approved = submissions.filter((s) => s.status === "approved");

  const fromBoard = bank.map((q) => ({ clue: q.clue, answerTitle: q.answerTitle, answerAuthor: q.answerAuthor, category: q.category }));
  const fromStudents = approved.map((q) => ({ clue: q.questionText, answerTitle: q.bookTitle, answerAuthor: q.bookAuthor, category: q.category }));
  return shuffle([...fromBoard, ...fromStudents]);
}

function publicState(room) {
  // Never expose hostToken or the full remaining pool to pollers.
  const { hostToken, pool, ...rest } = room;
  return rest;
}

function freshRoundFields(room, roundLength) {
  room.teams.forEach((t) => (t.score = 0));
  room.roundLength = roundLength;
  room.upTeamIndex = Math.random() < 0.5 ? 0 : 1;
  room.questionsAsked = 0;
  room.stage = "idle";
  room.currentQuestion = null;
  room.stageStartedAt = null;
  room.finished = false;
  room.resultHeadline = null;
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const roomStore = getStore(ROOM_STORE);

  try {
    if (event.httpMethod === "GET") {
      const code = (event.queryStringParameters || {}).code;
      if (!code) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "code is required." }) };
      }
      const room = await roomStore.get(`room:${code}`, { type: "json" });
      if (!room) {
        return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Room not found." }) };
      }
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(publicState(room)) };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed." }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Body must be valid JSON." }) };
    }

    if (body.action === "create") {
      const teamAName = (body.teamAName || "Team A").trim().slice(0, 30);
      const teamBName = (body.teamBName || "Team B").trim().slice(0, 30);
      const roundLength = [6, 8, 12].includes(Number(body.roundLength)) ? Number(body.roundLength) : 12;

      let code, exists;
      do {
        code = makeCode();
        exists = await roomStore.get(`room:${code}`, { type: "json" });
      } while (exists);

      const pool = await loadCombinedPool();
      const hostToken = makeToken();
      const room = {
        code,
        hostToken,
        teams: [{ name: teamAName, score: 0 }, { name: teamBName, score: 0 }],
        roundLength,
        upTeamIndex: Math.random() < 0.5 ? 0 : 1,
        questionsAsked: 0,
        stage: "idle", // idle | await-title | await-author | await-steal
        currentQuestion: null,
        stageStartedAt: null,
        pool,
        poolCursor: 0,
        finished: false,
        resultHeadline: null,
        createdAt: Date.now(),
      };
      await roomStore.setJSON(`room:${code}`, room);

      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ code, hostToken, state: publicState(room) }) };
    }

    // Every action below operates on an existing room.
    const code = body.code;
    if (!code) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "code is required." }) };
    }
    const room = await roomStore.get(`room:${code}`, { type: "json" });
    if (!room) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Room not found." }) };
    }
    if (Date.now() - (room.createdAt || 0) > ROOM_TTL_MS) {
      return { statusCode: 410, headers: corsHeaders(), body: JSON.stringify({ error: "This room has expired." }) };
    }

    if (body.action === "join") {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(publicState(room)) };
    }

    // Everything past this point requires the host token.
    if (body.hostToken !== room.hostToken) {
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: "Only the host can do that." }) };
    }

    if (body.action === "draw") {
      if (room.poolCursor >= room.pool.length) {
        room.pool = shuffle(room.pool);
        room.poolCursor = 0;
      }
      room.currentQuestion = room.pool[room.poolCursor];
      room.poolCursor += 1;
      room.questionsAsked += 1;
      room.stage = "await-title";
      room.stageStartedAt = Date.now();
    } else if (body.action === "score") {
      const ev = body.event;
      const otherIndex = room.upTeamIndex === 0 ? 1 : 0;

      if (ev === "title-correct") {
        room.teams[room.upTeamIndex].score += 2;
        room.stage = "await-author";
        room.stageStartedAt = null;
      } else if (ev === "title-wrong") {
        room.stage = "await-steal";
        room.stageStartedAt = Date.now();
      } else if (ev === "author-correct") {
        room.teams[room.upTeamIndex].score += 1;
        finishRoomQuestion(room);
      } else if (ev === "author-wrong") {
        finishRoomQuestion(room);
      } else if (ev === "steal-correct") {
        room.teams[otherIndex].score += 2;
        finishRoomQuestion(room);
      } else if (ev === "steal-wrong") {
        finishRoomQuestion(room);
      } else {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Unknown scoring event." }) };
      }
    } else if (body.action === "end") {
      room.finished = true;
      room.stage = "idle";
      computeResultHeadline(room);
    } else if (body.action === "rematch") {
      freshRoundFields(room, room.roundLength);
      room.pool = await loadCombinedPool();
      room.poolCursor = 0;
    } else if (body.action === "tiebreaker") {
      freshRoundFields(room, 12);
      room.pool = await loadCombinedPool();
      room.poolCursor = 0;
    } else {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Unknown action." }) };
    }

    await roomStore.setJSON(`room:${code}`, room);
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(publicState(room)) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server error.", message: String((err && err.message) || err) }),
    };
  }
};

function finishRoomQuestion(room) {
  room.stage = "idle";
  room.stageStartedAt = null;
  room.upTeamIndex = room.upTeamIndex === 0 ? 1 : 0;
  if (room.questionsAsked >= room.roundLength) {
    room.finished = true;
    computeResultHeadline(room);
  }
}

function computeResultHeadline(room) {
  const [a, b] = room.teams;
  if (a.score === b.score) {
    room.resultHeadline = `It's a tie! ${a.score} — ${b.score}`;
  } else {
    const winner = a.score > b.score ? a : b;
    room.resultHeadline = `${winner.name} wins!`;
  }
}
