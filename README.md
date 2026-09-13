# Panther Bob Quiz
### A Jeopardy-style game for the NC Middle School Battle of the Books (2026–2027 list)

## What's in here

```
index.html               the home page — pick which game to play
board.html               the Jeopardy-style board game (player setup, scoreboard, board)
match.html               memory-match game (two players, timed)
drill.html               speed drill (bouncing tiles, 1-5 players, timed)
wheel.html               Wheel of Fortune style letter-guessing game (1-5 players)
crossword.html           solo crossword practice (4 rounds, covers all 16 books)
authors.html             author name pronunciations (text-to-speech, no audio files)
admin.html               question bank manager (type in or import questions)
landing.css / style.css / admin.css / match.css / drill.css / wheel.css / crossword.css / authors.css
landing.js               home page logic (the lists of games/resources shown as cards)
gate.js                  site-wide PIN gate + Change PIN control (loaded on every page)
app.js                   board game logic
match.js                 memory-match game logic
drill.js                 speed drill logic
wheel.js                 Wheel of Fortune game logic
crossword.js             crossword game logic (reads precomputed layouts)
authors.js               author pronunciation logic (Web Speech API)
admin.js                 admin page logic
data/seed-questions.json 80 starter questions across all 8 categories
data/books.json          the 16 books (title/author) used by match, drill, wheel, crossword & authors
data/crossword-rounds.json   precomputed crossword layouts for all 4 rounds (see scripts/)
scripts/generate-crosswords.js   one-off generator that produced crossword-rounds.json
netlify/functions/questions.js   backend — reads/writes questions via Netlify Blobs
netlify/functions/auth.js         backend — verifies/changes the site PIN via Netlify Blobs
netlify/functions/lib/pin-store.js   shared helper used by both functions above
netlify.toml              Netlify build + routing config
package.json              declares the @netlify/blobs dependency
assets/card-back-logo.png the Battle of the Books panther logo (memory-match card backs)
assets/match-background.jpg  background art for the memory-match page
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

## PIN gate

The whole site sits behind a PIN, checked in `netlify/functions/auth.js`
and stored in Netlify Blobs (not in the code, so changing it doesn't
require a redeploy). **The starting PIN is `000000`.**

- Every page loads a full-screen lock overlay (`gate.js`) until the right
  PIN is entered. Unlocking is remembered for that browser **tab's
  session only** — close the tab or browser and it locks again next time.
- A **"🔒 Change PIN"** link sits at the bottom of every page. It asks for
  the current PIN plus a new one (4–10 digits) and saves it for everyone,
  site-wide — there's only one PIN, not separate logins per person.
- While the PIN is still the default, the lock screen shows a small
  reminder to change it.

**Worth knowing:** this gate protects the *pages* — nobody gets to look at
or play anything without the PIN. It does **not** currently protect the
`/api/questions` endpoint itself from someone who calls it directly
(bypassing the page entirely, e.g. with `curl`) — GET is harmless (it only
returns clue text that's visible in the games anyway), but a technically
determined visitor could still POST or DELETE questions straight against
the API without ever seeing the lock screen. For a school-use tool where
the real goal is "keep casual visitors out," this is a reasonable
trade-off. If you want the question bank's writes locked down too — so
even a direct API call needs the PIN — that's a follow-up I can add
(the same PIN would need to travel with each admin request); just say
the word.

## Wheel of Fortune

`wheel.html` — 1–5 players take turns. Consonants are free to guess (a
correct guess reveals every occurrence and the same player goes again; a
wrong guess passes the turn). Vowels cost 25 points to reveal — that cost
is deducted whether the vowel turns out to be in the title or not, but
buying one never ends your turn either way. Anyone can attempt to solve
the full title at any time; a correct solve ends the round with a +50
bonus, a wrong one passes the turn. Puzzles are picked one at a time from
`data/books.json` with the same no-repeat-until-exhausted rotation used
elsewhere. "New Puzzle" keeps scores; "New Game" resets everything.

## Crossword

`crossword.html` is solo practice. All 16 books are split into 4 fixed
rounds of 4 — the author is the clue, the book title (letters only, no
spaces/punctuation) is the answer. Layouts are **precomputed**, not
generated live in the browser: `scripts/generate-crosswords.js` runs a
small placement algorithm that tries to interlock each round's 4 titles
on shared letters, falling back to placing a title disconnected nearby if
no valid crossing exists. Its output is `data/crossword-rounds.json`,
which `crossword.js` just reads and renders. As it turned out, every one
of the 4 rounds found a fully interlocking layout — no disconnected
placements were needed for this particular book list, though the
fallback logic is still there in case a future list needs it.

If you ever change which 16 books are on the list, re-run the generator:

```bash
node scripts/generate-crosswords.js
```

This overwrites `data/crossword-rounds.json` with new layouts and prints
an ASCII preview of each round so you can sanity-check them before
committing.

Click "Check My Answers" to see how many letters are right so far (it
doesn't reveal what the correct ones are), or "Reveal Solution" to fill
in the whole round. "Next Round" advances through all 4; after the 4th,
a completion screen confirms all 16 books have been practiced and offers
to start over.

## Author Pronunciations

`authors.html` lists all 16 authors with a 🔊 button next to each name.
This uses the browser's **built-in text-to-speech** (the Web Speech API)
— there are no audio files to host or generate, and it works offline once
the page has loaded. It won't always get unusual names exactly right, but
it's free and instant. A "Play All" button reads through the whole list
in order. If a browser doesn't support speech synthesis, the page shows a
plain warning instead of silently doing nothing.

The home page's Learning Resources section also links out to
[TeachingBooks' Author & Illustrator Pronunciation Guide](https://school.teachingbooks.net/pronunciations.cgi)
— a professionally recorded pronunciation library. It looked like it may
need a TeachingBooks sign-in/subscription to actually play clips (there's
a sign-in and pricing link on their page), so double-check your school's
access before relying on it with students.

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
