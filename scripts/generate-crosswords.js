// scripts/generate-crosswords.js
//
// Run once (node scripts/generate-crosswords.js) to produce
// data/crossword-rounds.json. Not needed at runtime — the crossword game
// just reads the precomputed output. Re-run this only if the book list
// or round groupings change.
//
// Strategy: each round's 4 titles (letters only, punctuation/spaces
// stripped) are placed one at a time. Every word after the first tries to
// cross an already-placed word on a shared letter, checking that the
// crossing is clean (no accidental adjacent collisions). If no valid
// crossing exists anywhere, the word is placed disconnected, offset below
// the current layout, so the round still has a valid board either way.

const fs = require("fs");
const path = require("path");

const books = require("../data/books.json");

function stripToLetters(s) {
  return s.toUpperCase().replace(/[^A-Z]/g, "");
}

// Split the (alphabetically ordered) 16 books into 4 sequential groups of 4.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isValidPlacement(word, row, col, dir, occupied) {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;

  // Cell immediately before the start and immediately after the end must
  // be empty, so this word doesn't silently extend an existing word.
  const beforeR = row - dr, beforeC = col - dc;
  const afterR = row + dr * word.length, afterC = col + dc * word.length;
  if (occupied.has(`${beforeR},${beforeC}`)) return false;
  if (occupied.has(`${afterR},${afterC}`)) return false;

  let crossings = 0;

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const key = `${r},${c}`;
    const existing = occupied.get(key);

    if (existing) {
      if (existing !== word[i]) return false; // letter conflict
      crossings += 1;
      // This is a shared cell — fine. Do NOT also require empty perpendicular
      // neighbors here, since this cell legitimately belongs to two words.
    } else {
      // Empty cell — check its perpendicular neighbors are also empty, so
      // this letter doesn't sit directly beside an unrelated word (which
      // would silently form an unintended adjacent word).
      const side1 = dir === "across" ? `${r - 1},${c}` : `${r},${c - 1}`;
      const side2 = dir === "across" ? `${r + 1},${c}` : `${r},${c + 1}`;
      if (occupied.has(side1)) return false;
      if (occupied.has(side2)) return false;
    }
  }

  return crossings > 0; // must actually cross something to count as a valid interlock
}

function placeWord(word, row, col, dir, occupied) {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    occupied.set(`${row + dr * i},${col + dc * i}`, word[i]);
  }
}

function findCrossingPlacement(word, placements, occupied) {
  for (const p of placements) {
    for (let i = 0; i < word.length; i++) {
      for (let j = 0; j < p.answer.length; j++) {
        if (word[i] !== p.answer[j]) continue;
        const newDir = p.dir === "across" ? "down" : "across";
        let row, col;
        if (newDir === "down") {
          row = p.row - i;
          col = p.col + j;
        } else {
          row = p.row + j;
          col = p.col - i;
        }
        if (isValidPlacement(word, row, col, newDir, occupied)) {
          return { row, col, dir: newDir };
        }
      }
    }
  }
  return null;
}

function placeDisconnected(word, placements, occupied) {
  let maxRow = 0;
  placements.forEach((p) => {
    const dr = p.dir === "down" ? 1 : 0;
    const endRow = p.row + dr * (p.answer.length - 1);
    if (endRow > maxRow) maxRow = endRow;
  });
  const row = maxRow + 2;
  const col = 0;
  placeWord(word, row, col, "across", occupied);
  return { row, col, dir: "across" };
}

function generateRound(booksInRound) {
  const words = booksInRound
    .map((b) => ({ ...b, answer: stripToLetters(b.title) }))
    .sort((a, b) => b.answer.length - a.answer.length);

  const occupied = new Map();
  const placements = [];

  words.forEach((w, idx) => {
    let placement;
    if (idx === 0) {
      placement = { row: 0, col: 0, dir: "across" };
      placeWord(w.answer, 0, 0, "across", occupied);
    } else {
      placement = findCrossingPlacement(w.answer, placements, occupied);
      if (placement) {
        placeWord(w.answer, placement.row, placement.col, placement.dir, occupied);
      } else {
        placement = placeDisconnected(w.answer, placements, occupied);
      }
    }
    placements.push({ ...w, ...placement });
  });

  // Normalize so min row/col = 0.
  const minRow = Math.min(...placements.map((p) => p.row));
  const minCol = Math.min(...placements.map((p) => p.col));
  placements.forEach((p) => {
    p.row -= minRow;
    p.col -= minCol;
  });

  const maxRow = Math.max(...placements.map((p) => p.row + (p.dir === "down" ? p.answer.length - 1 : 0)));
  const maxCol = Math.max(...placements.map((p) => p.col + (p.dir === "across" ? p.answer.length - 1 : 0)));

  // Assign clue numbers in reading order (top-to-bottom, left-to-right).
  const ordered = [...placements].sort((a, b) => a.row - b.row || a.col - b.col);
  ordered.forEach((p, i) => { p.clueNumber = i + 1; });

  return {
    rows: maxRow + 1,
    cols: maxCol + 1,
    entries: placements.map((p) => ({
      clueNumber: p.clueNumber,
      title: p.title,
      author: p.author,
      answer: p.answer,
      row: p.row,
      col: p.col,
      dir: p.dir,
    })),
  };
}

function asciiPreview(round) {
  const grid = Array.from({ length: round.rows }, () => Array(round.cols).fill("·"));
  round.entries.forEach((e) => {
    for (let i = 0; i < e.answer.length; i++) {
      const r = e.dir === "down" ? e.row + i : e.row;
      const c = e.dir === "across" ? e.col + i : e.col;
      grid[r][c] = e.answer[i];
    }
  });
  return grid.map((row) => row.join(" ")).join("\n");
}

const groups = chunk(books, 4);
const rounds = groups.map((g, i) => {
  const round = generateRound(g);
  console.log(`\n=== Round ${i + 1} (${round.rows}x${round.cols}) ===`);
  round.entries.forEach((e) =>
    console.log(`  #${e.clueNumber} ${e.dir.padEnd(6)} (${e.row},${e.col}) len=${e.answer.length}  "${e.title}" — ${e.author}`)
  );
  console.log(asciiPreview(round));
  return round;
});

const outPath = path.join(__dirname, "..", "data", "crossword-rounds.json");
fs.writeFileSync(outPath, JSON.stringify(rounds, null, 2));
console.log(`\nWrote ${outPath}`);
