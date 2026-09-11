# Panther Bob Quiz
### A Jeopardy-style game for the NC Middle School Battle of the Books (2026–2027 list)

## What's in here

```
index.html              the game (player setup, scoreboard, board)
admin.html               question bank manager (type in or import questions)
style.css / admin.css
app.js                   game logic
admin.js                 admin page logic
data/seed-questions.json 80 starter questions across all 8 categories
netlify/functions/questions.js   the backend — reads/writes questions via Netlify Blobs
netlify.toml              Netlify build + routing config
package.json              declares the @netlify/blobs dependency
```

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
