/**
 * Panther Bob Games — Google version (Code.gs)
 * GCS Creatives Project by Grace Campbell-Sheran, Copyright 2026
 *
 * This is the ONE file you paste into Google Apps Script. It does three jobs:
 *
 *   1. SERVES THE GAMES. Each time someone opens a page, it reads that
 *      page's files straight from the public GitHub repo, bundles them into
 *      one page, and hands it to the browser. A copy is kept for
 *      CACHE_MINUTES so GitHub isn't asked on every visit. Update a game on
 *      GitHub and the change shows up here on its own (within ~15 minutes).
 *
 *   2. REPLACES NETLIFY BLOBS. The question bank and student submissions
 *      live in tabs of the Google Sheet this script is attached to.
 *      Online battle rooms live in Google's short-term memory (cache).
 *
 *   3. REPLACES THE PIN. The web app is deployed so only people signed in
 *      to your school Google account can open it at all. Teacher-only pages
 *      (Manage Questions, Review) and teacher-only actions only work for the
 *      emails listed in TEACHER_EMAILS (plus you, the owner).
 *
 * You should only ever need to edit the CONFIG block below — and only in the
 * Google copy. Never put real email addresses into the GitHub copy of this
 * file, because the repo is public.
 */

const CONFIG = {
  // Where the game files live on GitHub. Must be a PUBLIC repo.
  GITHUB_REPO: "GCS-creatives/pantherbob",
  GITHUB_BRANCH: "main",

  // Teachers who may manage questions and review submissions.
  // You (the script owner) are always included automatically.
  // Example: ["someone@yourdistrict.org", "another@yourdistrict.org"]
  TEACHER_EMAILS: [],

  // Your published Google Site address, e.g.
  // "https://sites.google.com/yourdistrict.org/panther-bob-games"
  // Leave "" until the Site exists. When set, links between games go to
  // your Site's pages instead of the bare app.
  SITE_URL: "",

  // If clicking a game link inside Google Sites does nothing, set this to
  // true and links will open in a new tab instead.
  LINKS_IN_NEW_TAB: false,

  // Optional: a Google Drive link to the printable study guide PDF.
  // Leave "" to use the copy on GitHub.
  STUDY_GUIDE_URL: "",

  // Optional, used once by importFromNetlify(): your old Netlify site,
  // e.g. "https://panther-bob.netlify.app"
  NETLIFY_URL: "",

  // How long a page copy is kept before re-checking GitHub.
  CACHE_MINUTES: 10,
};

// ---------------------------------------------------------------------------
// Fixed settings — no need to change these.
// ---------------------------------------------------------------------------

const PAGES = {
  index: "Home",
  board: "Jeopardy Board",
  match: "Memory Match",
  drill: "Speed Drill",
  wheel: "Wheel of Fortune",
  crossword: "Crossword",
  authors: "Author Pronunciations",
  submit: "Submit a Question",
  "student-quiz": "Student Questions",
  study: "Solo Study",
  straightup: "Straight-Up Battle",
  "straightup-online": "Straight-Up Battle Online",
  mystery: "Mystery Book",
  bingo: "Battle Bingo",
  truthlie: "Two Truths and a Lie",
  admin: "Manage Questions",
  review: "Review Submissions",
};
const TEACHER_PAGES = ["admin", "review"];
const DATA_FILES = ["books.json", "crossword-rounds.json", "seed-questions.json", "two-truths-lie.json"];

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

const Q_SHEET = "Questions";
const Q_HEADERS = ["id", "category", "points", "clue", "answerTitle", "answerAuthor"];
const S_SHEET = "Student Submissions";
const S_HEADERS = ["id", "studentName", "bookTitle", "bookAuthor", "questionText", "pageNumber", "status", "category", "points", "submittedAt"];

const CACHE_FORMAT = "v1"; // bump when the page-building logic changes
const BACKUP_SECONDS = 6 * 60 * 60; // longest Google allows; used if GitHub is down
const ROOM_SECONDS = 6 * 60 * 60; // online battle rooms last up to 6 hours
const SUBMISSIONS_PER_HOUR = 15; // per student, to stop spam

// ===========================================================================
// 1. SERVING PAGES
// ===========================================================================

function doGet(e) {
  const params = (e && e.parameter) || {};
  const page = Object.prototype.hasOwnProperty.call(PAGES, params.page) ? params.page : "index";
  const teacher = isTeacher_();

  if (params.refresh && teacher) clearPageCache_();

  if (TEACHER_PAGES.indexOf(page) !== -1 && !teacher) {
    return output_(messagePage_("Teachers only", "This page is only available to teachers. Ask your librarian if you think you should have access."), "Teachers only");
  }

  let html;
  try {
    html = getBuiltPage_(page);
  } catch (err) {
    return output_(messagePage_("Couldn't load this game", "The game files couldn't be reached right now. Please try again in a few minutes."), "Panther Bob Games");
  }

  const env = {
    page: page,
    isTeacher: teacher,
    pageUrls: pageUrls_(),
    linkTarget: CONFIG.LINKS_IN_NEW_TAB ? "_blank" : "_top",
    assetBase: rawUrl_(""),
    studyGuideUrl: CONFIG.STUDY_GUIDE_URL || "",
  };
  html = html.replace("<!--PBQ_ENV-->", function () {
    return "<script>window.PBQ_ENV = " + safeJson_(env) + ";</script>";
  });

  return output_(html, PAGES[page] + " — Panther Bob Games");
}

function output_(html, title) {
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    // Lets Google Sites show the app inside a page. Only signed-in school
    // accounts can open the app at all, so this doesn't open it to others.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function messagePage_(heading, text) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;text-align:center;color:#1b2a4a">' +
    '<div style="font-size:48px">🐾</div><h2>' + escapeHtml_(heading) + "</h2><p>" + escapeHtml_(text) + "</p>" +
    '<p style="margin-top:40px;font-size:12px;color:#666">GCS Creatives Project by Grace Campbell-Sheran, Copyright ' + new Date().getFullYear() + "</p>" +
    "</body></html>";
}

function pageUrls_() {
  const appUrl = ScriptApp.getService().getUrl();
  const site = (CONFIG.SITE_URL || "").replace(/\/+$/, "");
  const urls = {};
  Object.keys(PAGES).forEach(function (p) {
    if (site && TEACHER_PAGES.indexOf(p) === -1) {
      urls[p] = p === "index" ? site : site + "/" + p;
    } else {
      urls[p] = appUrl + "?page=" + encodeURIComponent(p);
    }
  });
  return urls;
}

/** Returns the bundled page, from cache when fresh, from GitHub otherwise. */
function getBuiltPage_(page) {
  const key = "page:" + CACHE_FORMAT + ":" + cacheGeneration_() + ":" + page;
  const backupKey = "backup:" + CACHE_FORMAT + ":" + page;

  const fresh = cacheGetBig_(key);
  if (fresh) return fresh;

  try {
    const built = buildPage_(page);
    cachePutBig_(key, built, CONFIG.CACHE_MINUTES * 60);
    cachePutBig_(backupKey, built, BACKUP_SECONDS);
    return built;
  } catch (err) {
    const backup = cacheGetBig_(backupKey);
    if (backup) return backup;
    throw err;
  }
}

/**
 * Turns e.g. board.html + style.css + app.js + data files into ONE page,
 * because Google can't serve separate files side by side the way Netlify can.
 */
function buildPage_(page) {
  let html = fetchText_(page + ".html");

  // The PIN gate is replaced by Google sign-in.
  html = html.replace(/<script\s+src="gate\.js"\s*><\/script>\s*/g, "");

  // Stylesheets → inline <style>, with images turned into embedded data.
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, function (m, href) {
    let css = fetchText_(href);
    css = css.replace(/url\(\s*["']?(assets\/[^"')]+)["']?\s*\)/g, function (m2, assetPath) {
      return 'url("' + dataUri_(assetPath) + '")';
    });
    return "<style>\n" + css.replace(/<\/style/gi, "<\\/style") + "\n</style>";
  });

  // Scripts → inline <script>.
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, function (m, src) {
    const js = fetchText_(src);
    return "<script>\n" + js.replace(/<\/script/gi, "<\\/script") + "\n</script>";
  });

  // Data files the games normally download, plus the translator (shim.js).
  const data = {};
  DATA_FILES.forEach(function (name) {
    data[name] = JSON.parse(fetchText_("data/" + name));
  });
  const head =
    "<!--PBQ_ENV-->\n" +
    "<script>window.PBQ_DATA = " + safeJson_(data) + ";</script>\n" +
    "<script>\n" + fetchText_("google-version/shim.js").replace(/<\/script/gi, "<\\/script") + "\n</script>\n";

  if (html.indexOf("</head>") !== -1) {
    html = html.replace("</head>", function () { return head + "</head>"; });
  } else {
    html = head + html;
  }
  return html;
}

function rawUrl_(path) {
  return "https://raw.githubusercontent.com/" + CONFIG.GITHUB_REPO + "/" + CONFIG.GITHUB_BRANCH + "/" + path;
}

function fetchText_(path) {
  const res = UrlFetchApp.fetch(rawUrl_(path), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error("GitHub returned " + res.getResponseCode() + " for " + path);
  }
  return res.getContentText("UTF-8");
}

function dataUri_(path) {
  const res = UrlFetchApp.fetch(rawUrl_(path), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return rawUrl_(path);
  const ext = path.split(".").pop().toLowerCase();
  const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
  return "data:" + (types[ext] || "application/octet-stream") + ";base64," + Utilities.base64Encode(res.getBlob().getBytes());
}

/** Visit the app with ?refresh=1 (as a teacher) to pull GitHub changes right away. */
function clearPageCache_() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("CACHE_GENERATION", String(Number(cacheGeneration_()) + 1));
}
function cacheGeneration_() {
  return PropertiesService.getScriptProperties().getProperty("CACHE_GENERATION") || "0";
}

// Google's cache holds at most 100 KB per entry, so bigger things are split
// into numbered pieces. 24,000 characters stays under 100 KB even if every
// character were a 4-byte emoji.
const CHUNK = 24000;

function cachePutBig_(key, str, seconds) {
  const cache = CacheService.getScriptCache();
  const count = Math.ceil(str.length / CHUNK) || 1;
  const entries = {};
  for (let i = 0; i < count; i++) entries[key + "#" + i] = str.substr(i * CHUNK, CHUNK);
  entries[key] = String(count);
  cache.putAll(entries, Math.min(seconds, 21600));
}

function cacheGetBig_(key) {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key));
  if (!count) return null;
  const keys = [];
  for (let i = 0; i < count; i++) keys.push(key + "#" + i);
  const parts = cache.getAll(keys);
  let out = "";
  for (let i = 0; i < count; i++) {
    const piece = parts[keys[i]];
    if (piece == null) return null;
    out += piece;
  }
  return out;
}

function cacheRemoveBig_(key) {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key)) || 0;
  const keys = [key];
  for (let i = 0; i < count; i++) keys.push(key + "#" + i);
  cache.removeAll(keys);
}

// ===========================================================================
// 2. THE "API" — what used to be the Netlify functions
// ===========================================================================

/**
 * Called from the browser by shim.js in place of fetch("/api/...").
 * Returns { status, body } where body is a JSON string, just like Netlify did.
 */
function pbqApi(req) {
  try {
    req = req || {};
    const path = String(req.path || "");
    const method = String(req.method || "GET").toUpperCase();
    const query = req.query || {};
    let body = null;
    if (req.body) {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        return reply_(400, { error: "Body must be valid JSON." });
      }
    }

    if (path === "/api/questions") return questionsApi_(method, body);
    if (path === "/api/student-questions") return studentQuestionsApi_(method, query, body);
    if (path === "/api/battle-room") return battleRoomApi_(method, query, body);
    if (path === "/api/auth") return reply_(200, { isDefault: false, ok: true });
    return reply_(404, { error: "Unknown endpoint." });
  } catch (err) {
    console.error(err);
    return reply_(500, { error: "Server error." });
  }
}

function reply_(status, obj) {
  return { status: status, body: JSON.stringify(obj) };
}

function teacherOnly_() {
  return reply_(403, { error: "Only teachers can do that." });
}

// ---- Who is this? --------------------------------------------------------

function currentEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || "").toLowerCase();
  } catch (e) {
    return "";
  }
}

function isTeacher_() {
  const email = currentEmail_();
  if (!email) return false;
  let owner = "";
  try {
    owner = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  } catch (e) {}
  if (email === owner) return true;
  return CONFIG.TEACHER_EMAILS.map(function (t) { return String(t).toLowerCase().trim(); }).indexOf(email) !== -1;
}

// ---- Question bank -------------------------------------------------------

function questionsApi_(method, body) {
  if (method === "GET") {
    return reply_(200, loadBank_());
  }
  if (!isTeacher_()) return teacherOnly_();

  if (method === "POST") {
    const toAdd = Array.isArray(body) ? body : [body];
    const problems = [];
    toAdd.forEach(function (q, i) {
      const errs = validateQuestion_(q);
      if (errs.length) problems.push({ index: i, errors: errs });
    });
    if (problems.length) return reply_(400, { error: "Validation failed.", details: problems });

    return withLock_(function () {
      const bank = loadBank_(); // makes sure the starter questions are in place first
      const added = toAdd.map(function (q) {
        return {
          id: q.id && typeof q.id === "string" ? q.id.slice(0, 60) : makeId_("q"),
          category: q.category,
          points: Number(q.points),
          clue: q.clue.trim(),
          answerTitle: q.answerTitle.trim(),
          answerAuthor: q.answerAuthor.trim(),
        };
      });
      appendRows_(sheet_(Q_SHEET, Q_HEADERS), Q_HEADERS, added);
      return reply_(200, { added: added.length, total: bank.length + added.length, questions: added });
    });
  }

  if (method === "DELETE") {
    if (!body || !body.id) return reply_(400, { error: "id is required." });
    return withLock_(function () {
      const removed = deleteRowsById_(sheet_(Q_SHEET, Q_HEADERS), body.id);
      return reply_(200, { removed: removed, total: readRows_(sheet_(Q_SHEET, Q_HEADERS), Q_HEADERS).length });
    });
  }
  return reply_(405, { error: "Method not allowed." });
}

function validateQuestion_(q) {
  const errors = [];
  if (!q || typeof q !== "object") return ["Question must be an object."];
  if (VALID_CATEGORIES.indexOf(q.category) === -1) errors.push("category must be one of: " + VALID_CATEGORIES.join(", "));
  if (VALID_POINTS.indexOf(Number(q.points)) === -1) errors.push("points must be one of: " + VALID_POINTS.join(", "));
  ["clue", "answerTitle", "answerAuthor"].forEach(function (f) {
    if (!q[f] || typeof q[f] !== "string" || !q[f].trim()) errors.push(f + " is required.");
    else if (q[f].length > 600) errors.push(f + " is too long.");
  });
  return errors;
}

/** Reads the bank; the very first time, fills it with the 80 starter questions. */
function loadBank_() {
  const sheet = sheet_(Q_SHEET, Q_HEADERS);
  let rows = readRows_(sheet, Q_HEADERS);
  const props = PropertiesService.getScriptProperties();
  if (!rows.length && !props.getProperty("SEEDED")) {
    withLock_(function () {
      if (props.getProperty("SEEDED")) return;
      const seed = JSON.parse(fetchText_("data/seed-questions.json"));
      appendRows_(sheet, Q_HEADERS, seed);
      props.setProperty("SEEDED", "yes");
    });
    rows = readRows_(sheet, Q_HEADERS);
  }
  return rows.map(function (r) {
    r.points = Number(r.points);
    return r;
  });
}

// ---- Student submissions -------------------------------------------------

function studentQuestionsApi_(method, query, body) {
  const sheet = sheet_(S_SHEET, S_HEADERS);

  if (method === "GET") {
    const status = query.status || "all";
    // Students may only see approved questions; everything else is teacher-only.
    if (status !== "approved" && !isTeacher_()) return teacherOnly_();
    const all = readRows_(sheet, S_HEADERS).map(cleanSubmission_);
    return reply_(200, status === "all" ? all : all.filter(function (s) { return s.status === status; }));
  }

  if (method === "POST") {
    if (!body) return reply_(400, { error: "Body is required." });
    const errors = [];
    if (!body.bookTitle || typeof body.bookTitle !== "string") errors.push("bookTitle is required.");
    if (!body.bookAuthor || typeof body.bookAuthor !== "string") errors.push("bookAuthor is required.");
    const middle = typeof body.questionMiddle === "string" ? body.questionMiddle.trim() : "";
    if (!middle) errors.push("Question text is required.");
    if (middle.length > 300) errors.push("Question is too long (300 characters max).");
    const page = String(body.pageNumber || "").trim();
    if (!/^\d{1,4}$/.test(page)) errors.push("Page number must be a whole number.");
    if (errors.length) return reply_(400, { error: "Validation failed.", details: errors });

    if (!underRateLimit_()) {
      return reply_(429, { error: "You've sent a lot of questions this hour. Please try again later." });
    }

    const record = {
      id: makeId_("sq"),
      studentName: shortName_(body.studentName),
      bookTitle: body.bookTitle.slice(0, 200),
      bookAuthor: body.bookAuthor.slice(0, 200),
      questionText: "In which book " + middle.replace(/\?+$/, "") + "? (p. " + page + ")",
      pageNumber: page,
      status: "pending",
      category: "",
      points: "",
      submittedAt: new Date().toISOString(),
    };
    withLock_(function () {
      appendRows_(sheet, S_HEADERS, [record]);
    });
    return reply_(200, cleanSubmission_(record));
  }

  if (!isTeacher_()) return teacherOnly_();

  if (method === "PATCH") {
    if (!body || !body.id) return reply_(400, { error: "id is required." });
    if (["pending", "approved", "rejected"].indexOf(body.status) === -1) {
      return reply_(400, { error: "status must be pending, approved, or rejected." });
    }
    if (body.status === "approved") {
      if (VALID_CATEGORIES.indexOf(body.category) === -1) return reply_(400, { error: "A valid category is required to approve." });
      if (VALID_POINTS.indexOf(Number(body.points)) === -1) return reply_(400, { error: "A valid points value is required to approve." });
    }
    return withLock_(function () {
      const rows = readRows_(sheet, S_HEADERS);
      const idx = rows.findIndex(function (s) { return s.id === body.id; });
      if (idx === -1) return reply_(404, { error: "Submission not found." });
      const rec = rows[idx];
      rec.status = body.status;
      if (body.status === "approved") {
        rec.category = body.category;
        rec.points = Number(body.points);
      }
      writeRow_(sheet, S_HEADERS, idx, rec);
      return reply_(200, cleanSubmission_(rec));
    });
  }

  if (method === "DELETE") {
    if (!body || !body.id) return reply_(400, { error: "id is required." });
    return withLock_(function () {
      return reply_(200, { removed: deleteRowsById_(sheet, body.id) });
    });
  }
  return reply_(405, { error: "Method not allowed." });
}

function cleanSubmission_(s) {
  s.pageNumber = String(s.pageNumber);
  s.category = s.category || null;
  s.points = s.points === "" || s.points == null ? null : Number(s.points);
  s.submittedAt = s.submittedAt instanceof Date ? s.submittedAt.toISOString() : String(s.submittedAt || "");
  return s;
}

/** Keeps only a first name and last initial, e.g. "Jordan Michaels" → "Jordan M." */
function shortName_(raw) {
  const cleaned = String(raw || "").replace(/[^A-Za-zÀ-ÿ.'\- ]/g, "").trim();
  if (!cleaned) return "Anonymous";
  const parts = cleaned.split(/\s+/);
  const first = parts[0].slice(0, 20);
  const initial = parts.length > 1 ? " " + parts[parts.length - 1].charAt(0).toUpperCase() + "." : "";
  return first + initial;
}

function underRateLimit_() {
  const cache = CacheService.getScriptCache();
  const key = "rate:" + (currentEmail_() || "unknown") + ":" + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(key)) || 0;
  if (n >= SUBMISSIONS_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}

// ---- Online Straight-Up Battle ------------------------------------------
// Same rules as netlify/functions/battle-room.js. Rooms are kept in Google's
// cache instead of a database: fast, and they clean themselves up.

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function battleRoomApi_(method, query, body) {
  if (method === "GET") {
    const code = String(query.code || "").toUpperCase();
    if (!code) return reply_(400, { error: "code is required." });
    const room = loadRoom_(code);
    if (!room) return reply_(404, { error: "Room not found." });
    return reply_(200, publicRoom_(room));
  }
  if (method !== "POST") return reply_(405, { error: "Method not allowed." });
  if (!body) return reply_(400, { error: "Body is required." });

  if (body.action === "create") {
    const roundLength = [6, 8, 12].indexOf(Number(body.roundLength)) !== -1 ? Number(body.roundLength) : 12;
    const room = {
      code: "",
      hostToken: Utilities.getUuid(),
      teams: [
        { name: String(body.teamAName || "Team A").trim().slice(0, 30) || "Team A", score: 0 },
        { name: String(body.teamBName || "Team B").trim().slice(0, 30) || "Team B", score: 0 },
      ],
      roundLength: roundLength,
      upTeamIndex: Math.random() < 0.5 ? 0 : 1,
      questionsAsked: 0,
      stage: "idle",
      currentQuestion: null,
      stageStartedAt: null,
      pool: combinedPool_(),
      poolCursor: 0,
      finished: false,
      resultHeadline: null,
      createdAt: Date.now(),
    };
    return withLock_(function () {
      let code;
      do {
        code = "";
        for (let i = 0; i < 5; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
      } while (loadRoom_(code));
      room.code = code;
      saveRoom_(room);
      return reply_(200, { code: code, hostToken: room.hostToken, state: publicRoom_(room) });
    });
  }

  const code = String(body.code || "").toUpperCase();
  if (!code) return reply_(400, { error: "code is required." });

  return withLock_(function () {
    const room = loadRoom_(code);
    if (!room) return reply_(404, { error: "Room not found." });
    if (body.action === "join") return reply_(200, publicRoom_(room));
    if (body.hostToken !== room.hostToken) return reply_(403, { error: "Only the host can do that." });

    if (body.action === "draw") {
      if (!room.pool.length) return reply_(400, { error: "There are no questions in the bank yet." });
      if (room.poolCursor >= room.pool.length) {
        room.pool = shuffle_(room.pool);
        room.poolCursor = 0;
      }
      room.currentQuestion = room.pool[room.poolCursor];
      room.poolCursor += 1;
      room.questionsAsked += 1;
      room.stage = "await-title";
      room.stageStartedAt = Date.now();
    } else if (body.action === "score") {
      const other = room.upTeamIndex === 0 ? 1 : 0;
      switch (body.event) {
        case "title-correct":
          room.teams[room.upTeamIndex].score += 2;
          room.stage = "await-author";
          room.stageStartedAt = null;
          break;
        case "title-wrong":
          room.stage = "await-steal";
          room.stageStartedAt = Date.now();
          break;
        case "author-correct":
          room.teams[room.upTeamIndex].score += 1;
          finishRoomQuestion_(room);
          break;
        case "author-wrong":
          finishRoomQuestion_(room);
          break;
        case "steal-correct":
          room.teams[other].score += 2;
          finishRoomQuestion_(room);
          break;
        case "steal-wrong":
          finishRoomQuestion_(room);
          break;
        default:
          return reply_(400, { error: "Unknown scoring event." });
      }
    } else if (body.action === "end") {
      room.finished = true;
      room.stage = "idle";
      roomHeadline_(room);
    } else if (body.action === "rematch" || body.action === "tiebreaker") {
      room.teams.forEach(function (t) { t.score = 0; });
      room.roundLength = body.action === "tiebreaker" ? 12 : room.roundLength;
      room.upTeamIndex = Math.random() < 0.5 ? 0 : 1;
      room.questionsAsked = 0;
      room.stage = "idle";
      room.currentQuestion = null;
      room.stageStartedAt = null;
      room.finished = false;
      room.resultHeadline = null;
      room.pool = combinedPool_();
      room.poolCursor = 0;
    } else {
      return reply_(400, { error: "Unknown action." });
    }

    saveRoom_(room);
    return reply_(200, publicRoom_(room));
  });
}

function loadRoom_(code) {
  const text = cacheGetBig_("room:" + code);
  return text ? JSON.parse(text) : null;
}
function saveRoom_(room) {
  const left = ROOM_SECONDS - Math.floor((Date.now() - room.createdAt) / 1000);
  if (left <= 0) {
    cacheRemoveBig_("room:" + room.code);
    return;
  }
  cachePutBig_("room:" + room.code, JSON.stringify(room), left);
}
function publicRoom_(room) {
  const copy = JSON.parse(JSON.stringify(room));
  delete copy.hostToken;
  delete copy.pool;
  return copy;
}
function finishRoomQuestion_(room) {
  room.stage = "idle";
  room.stageStartedAt = null;
  room.upTeamIndex = room.upTeamIndex === 0 ? 1 : 0;
  if (room.questionsAsked >= room.roundLength) {
    room.finished = true;
    roomHeadline_(room);
  }
}
function roomHeadline_(room) {
  const a = room.teams[0];
  const b = room.teams[1];
  if (a.score === b.score) room.resultHeadline = "It's a tie! " + a.score + " — " + b.score;
  else room.resultHeadline = (a.score > b.score ? a : b).name + " wins!";
}
function combinedPool_() {
  const fromBoard = loadBank_().map(function (q) {
    return { clue: q.clue, answerTitle: q.answerTitle, answerAuthor: q.answerAuthor, category: q.category };
  });
  const fromStudents = readRows_(sheet_(S_SHEET, S_HEADERS), S_HEADERS)
    .filter(function (s) { return s.status === "approved"; })
    .map(function (s) {
      return { clue: s.questionText, answerTitle: s.bookTitle, answerAuthor: s.bookAuthor, category: s.category };
    });
  return shuffle_(fromBoard.concat(fromStudents));
}

// ===========================================================================
// 3. GOOGLE SHEET HELPERS
// ===========================================================================

function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("This script must be attached to a Google Sheet (Extensions → Apps Script).");
  return SpreadsheetApp.openById(id);
}

/** Gets a tab, creating it (with a bold, frozen header row) if missing. */
function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
    // Plain-text format so typed answers are never treated as formulas.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat("@");
  }
  return sh;
}

function readRows_(sh, headers) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values
    .filter(function (row) { return row[0] !== "" && row[0] != null; })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) {
        let v = row[i];
        if (typeof v === "string" && v.charAt(0) === "'") v = v.slice(1);
        obj[h] = v;
      });
      return obj;
    });
}

function appendRows_(sh, headers, objects) {
  if (!objects.length) return;
  const start = sh.getLastRow() + 1;
  const range = sh.getRange(start, 1, objects.length, headers.length);
  range.setNumberFormat("@");
  range.setValues(objects.map(function (o) { return headers.map(function (h) { return cellValue_(o[h]); }); }));
}

function writeRow_(sh, headers, index, obj) {
  sh.getRange(index + 2, 1, 1, headers.length).setValues([headers.map(function (h) { return cellValue_(obj[h]); })]);
}

function deleteRowsById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let removed = 0;
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

/** Stops text like "=IMPORTDATA(...)" from ever running as a formula. */
function cellValue_(v) {
  if (v == null) return "";
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

// ===========================================================================
// 4. SMALL UTILITIES
// ===========================================================================

// Makes sure two people saving at the same moment can't overwrite each
// other. If this request already holds the lock, it just carries on.
let lockHeld_ = false;
function withLock_(fn) {
  if (lockHeld_) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  lockHeld_ = true;
  try {
    return fn();
  } finally {
    lockHeld_ = false;
    lock.releaseLock();
  }
}

function makeId_(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function shuffle_(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** JSON that is safe to place inside a <script> tag. */
function safeJson_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028]/g, "\\u2028")
    .replace(/[\u2029]/g, "\\u2029");
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ===========================================================================
// 5. ONE-TIME TOOLS — run these from the Apps Script editor (▶ Run)
// ===========================================================================

/**
 * Run once after pasting: creates the two tabs, loads the 80 starter
 * questions, and asks for the permissions the app needs.
 */
function setup() {
  sheet_(S_SHEET, S_HEADERS);
  const bank = loadBank_();
  const unused = spreadsheet_().getSheetByName("Sheet1");
  if (unused && unused.getLastRow() === 0 && spreadsheet_().getSheets().length > 1) spreadsheet_().deleteSheet(unused);
  console.log("Setup done. Questions in bank: " + bank.length);
}

/**
 * Optional: copies the questions and student submissions from your old
 * Netlify site into this Sheet. Set CONFIG.NETLIFY_URL first, run ONCE.
 * Skips anything already copied, so running twice won't duplicate.
 */
function importFromNetlify() {
  const base = (CONFIG.NETLIFY_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("Set CONFIG.NETLIFY_URL first.");

  const qRes = UrlFetchApp.fetch(base + "/api/questions", { muteHttpExceptions: true });
  const sRes = UrlFetchApp.fetch(base + "/api/student-questions?status=all", { muteHttpExceptions: true });
  if (qRes.getResponseCode() !== 200 || sRes.getResponseCode() !== 200) {
    throw new Error("Couldn't read from Netlify (" + qRes.getResponseCode() + "/" + sRes.getResponseCode() + ").");
  }

  withLock_(function () {
    const qSheet = sheet_(Q_SHEET, Q_HEADERS);
    const sSheet = sheet_(S_SHEET, S_HEADERS);
    const haveQ = {};
    readRows_(qSheet, Q_HEADERS).forEach(function (q) { haveQ[q.id] = true; });
    const haveS = {};
    readRows_(sSheet, S_HEADERS).forEach(function (s) { haveS[s.id] = true; });

    const newQ = JSON.parse(qRes.getContentText()).filter(function (q) { return q.id && !haveQ[q.id]; });
    const newS = JSON.parse(sRes.getContentText())
      .filter(function (s) { return s.id && !haveS[s.id]; })
      .map(function (s) {
        s.studentName = shortName_(s.studentName);
        return s;
      });
    appendRows_(qSheet, Q_HEADERS, newQ);
    appendRows_(sSheet, S_HEADERS, newS);
    PropertiesService.getScriptProperties().setProperty("SEEDED", "yes");
    console.log("Imported " + newQ.length + " questions and " + newS.length + " student submissions.");
  });
}
