# Panther Bob Quiz
### A Jeopardy-style game for the NC Middle School Battle of the Books (2026–2027 list)

## What's in here

```
index.html               the home page — pick which game to play
board.html               the Jeopardy-style board game (player setup, scoreboard, board)
match.html               memory-match game (two players, timed)
drill.html               speed drill (bouncing tiles, 1-5 players, timed)
admin.html               question bank manager (type in or import questions)
landing.css / style.css / admin.css / match.css / drill.css
landing.js               home page logic (the list of games shown as cards)
app.js                   board game logic
match.js                 memory-match game logic
drill.js                 speed drill logic
admin.js                 admin page logic
data/seed-questions.json 80 starter questions across all 8 categories
data/books.json          the 16 books (title/author) used by the match & drill games
netlify/functions/questions.js   the backend — reads/writes questions via Netlify Blobs
netlify.toml              Netlify build + routing config
package.json              declares the @netlify/blobs dependency
assets/card-back-logo.png the Battle of the Books panther logo (memory-match card backs)
```

## The home page

`index.html` is now a simple game picker — it doesn't play anything itself,
it just lists the games as cards linking to their own pages. Every game
page's header also links back to it ("🏠 All Games") plus across to the
other games.

**Adding a future game:** drop in its own `<name>.html`/`.css`/`.js` files
the same way the existing games are structured, then add one object to the
`GAMES` array at the top of `landing.js` (name, emoji, short description,
and the filename to link to) — the card grid re-renders itself from that
list, so nothing else on the home page needs to change. Don't forget to
add a nav link to the new page from the other games' headers, the way they
already link to each other.

## How it works

- **8 categories** live in the question bank, each with clues at five difficulty
  levels ($100–$500). Every new board randomly picks **5 of the 8** categories
  and, for each cell, a random **unused** question — so back-to-back games look
  different. Once every question in a category/difficulty cell has been shown,
  that cell quietly starts recycling rather than running dry.
- **Answers are always "title and author"** — the clue itself is the obscure
  detail; whoever's turn it is just has to name the book and its author. You
  (the host) read the answer aloud and click which player got it right.
- The **question bank lives in Netlify Blobs** — a small built-in database
  tied to your Netlify site, no separate service needed. The admin page reads
  and writes to it through a serverless function at `/api/questions`.
- **Used-question tracking** (so you don't see the same clue twice in a row)
  is kept in the browser's `localStorage` on whatever device you're playing
  on — it resets when you start a brand new game.

## Setting this up: GitHub → Netlify

**1. Push this folder to GitHub**

```bash
cd panther-bob-quiz
git init
git add .
git commit -m "Initial commit: Panther Bob Quiz"
git branch -M main
git remote add origin https://github.com/<your-username>/panther-bob-quiz.git
git push -u origin main
```

**2. Connect it to Netlify**

1. Log into [app.netlify.com](https://app.netlify.com) and click **Add new site → Import an existing project**.
2. Choose **GitHub** and select the `panther-bob-quiz` repo.
3. Build settings: leave **Build command** blank and set **Publish directory** to `.` (this is a static site — `netlify.toml` already has these settings, so Netlify should pick them up automatically).
4. Click **Deploy site**.

**3. Netlify Blobs needs no extra setup**

Netlify Blobs is automatically available to any Netlify Function running on a
deployed site — there's nothing to turn on or configure. The very first time
anyone loads the game (or the admin page) after deploying, the function seeds
the blob store from `data/seed-questions.json`, and every question you add
after that is saved there permanently, across redeploys.

**4. Every future update**

Any time you push a change to `main` on GitHub, Netlify automatically
rebuilds and redeploys the site — no manual redeploy needed.

## Testing locally before you push (optional)

If you want to try it on your own machine first:

```bash
npm install -g netlify-cli
cd panther-bob-quiz
npm install
netlify dev
```

This runs the site *and* the serverless function together at `localhost:8888`,
using a local Blobs emulator so you can safely test adding/importing questions
before they ever touch your real deployed data.

## Panther Bob Match (memory game)

A second, simpler game lives at `match.html`, linked from the header of both
other pages. Two players take turns flipping cards to pair up a book's title
with its author. Each round deals out 8 of the 16 books (16 cards); a
countdown timer (60 seconds by default, adjustable at setup) runs for the
whole round, and whoever has the most pairs when it hits zero — or when the
board is fully cleared — wins.

Which 8 books show up rotates the same way the board game's questions do:
titles already used in the current cycle are tracked in the browser's
`localStorage`, so you see every book across roughly two rounds before
anything repeats. "Play Again" deals a fresh round and keeps both players'
scores; "New Game" resets everything and returns to the name/timer setup.

This game reads from `data/books.json` (just title + author, no clues) —
if you ever change the reading list, update that file rather than
`data/seed-questions.json`.

## Panther Bob Drill (speed match)

A third page, `drill.html`, is a fast-paced practice drill: all 16 books'
titles and authors bounce around a bounded arena (classic "screensaver"
physics — they bounce off the walls, not off each other). Click a title,
then click the author you think matches it (or the reverse) — a correct
pair pops and disappears; a wrong guess just flashes red and deselects,
no penalty besides lost time.

Each player gets one timed turn on a fresh, freshly-shuffled board (default
time cap: 120 seconds, adjustable at setup). Clearing all 16 pairs ends
that player's turn early and locks in their elapsed time; running out of
time ends the turn with however many pairs they'd found. After everyone's
gone, a leaderboard ranks players by pairs found first, then — among
anyone who fully cleared the board — by who did it fastest.

Like the memory-match game, this also reads straight from `data/books.json`.

## Adding questions later

- **Type one in:** Manage Questions → Add a Single Question.
- **Import a batch:** Manage Questions → Import Multiple Questions. Upload a
  CSV with this exact header row:

  ```csv
  category,points,clue,answerTitle,answerAuthor
  "New Places, New Faces",300,"This character learns her town has a hidden Underground Railroad stop.","Some Book Title","Some Author"
  ```

  or a JSON file that's an array of objects with those same five fields. The
  importer shows you a preview and flags any row with a bad category or
  missing field before anything is saved.
- **Categories are fixed to the current 8** (so the random-board logic keeps
  working correctly). If you ever want to add a 9th category, add it in two
  places: the `CATEGORIES` list at the top of `admin.js`, and the
  `VALID_CATEGORIES` list at the top of `netlify/functions/questions.js` —
  then redeploy.

## A note on the questions themselves

The 80 starter questions were written from real plot details, character
names, and author background researched for each of the 16 books on this
year's list — not copied from any existing trivia set or study guide. Worth
keeping in mind as you add more of your own.
