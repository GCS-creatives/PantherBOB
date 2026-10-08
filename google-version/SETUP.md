# Panther Bob Games on Google Sites — Setup Guide

GCS Creatives Project by Grace Campbell-Sheran, Copyright 2026

This folder lets the same games run on Google (so the school filter allows
them) while GitHub stays the main copy. The Netlify version keeps working
as before.

## How it fits together

```
GitHub (your game files)  ──read every ~10 min──▶  Apps Script (Code.gs)  ──▶  Google Sites pages
                                                        │
                                                        ▼
                                               Google Sheet (questions +
                                               student submissions)
```

- **Code.gs** is the only thing you paste into Google, and you paste it once.
  It reads the games from GitHub, bundles each one into a single page, and
  does the saving and loading Netlify Blobs used to do.
- **shim.js** is the translator. Code.gs adds it to every page so the game
  files work on Google without being rewritten.
- **Your Google Sheet** becomes the database, with a "Questions" tab and a
  "Student Submissions" tab. You can read, fix, or delete rows by hand.

**Use your SCHOOL Google account for every step below, not a personal Gmail.**
That keeps student submissions under your district's agreement with Google
(FERPA), and it limits the app to people in your district.

---

## Step 1 — Upload these files to GitHub

1. Unzip the download from Claude.
2. Go to `github.com/GCS-creatives/pantherbob`, then click **Add file → Upload files**.
3. Drag in **everything** from the unzipped folder, including the
   `google-version` folder. Files with the same name are replaced.
4. Click **Commit changes**.

The repo must stay **public**, because Code.gs reads the files without a
password. That's fine: nothing private lives in the repo. Teacher emails go
only in the Google copy of Code.gs (Step 2).

## Step 2 — Make the Sheet and paste Code.gs

1. In Google Drive (school account), create a new Google Sheet and name it
   **Panther Bob Games Data**.
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete the sample code in the editor. Open
   `google-version/Code.gs` on GitHub, click the **copy** icon (two
   squares, top right of the file), and paste it into the editor.
4. Near the top, find `TEACHER_EMAILS: []` and add any co-teachers:
   `TEACHER_EMAILS: ["coteacher@yourdistrict.org"],`
   You're included automatically as the owner.
5. Click the 💾 **Save** icon. Rename the project (top left) to
   **Panther Bob Games**.

## Step 3 — Run setup once

1. In the toolbar's function dropdown, choose **setup**, then click ▶ **Run**.
2. Google asks for permission. Click **Review permissions** and choose your
   school account. If you see "Google hasn't verified this app," click
   **Advanced → Go to Panther Bob Games**. That warning appears for any
   script you wrote yourself.
   - *What it asks for, and why:* the Sheet (to save questions), "connect
     to an external service" (to read your games from GitHub), and your
     email (to tell teachers from students).
3. Go back to the Sheet. You should see a **Questions** tab with 80 rows
   and an empty **Student Submissions** tab.

**Optional: bring over what's already on Netlify.** If you added questions
or have student submissions there, set `NETLIFY_URL` in CONFIG to your
Netlify address (e.g. `"https://panther-bob.netlify.app"`), save, choose
**importFromNetlify** in the dropdown, and click ▶ **Run**. It skips
anything already copied, so running it twice is harmless.

## Step 4 — Publish it as a web app

1. Click **Deploy → New deployment**, click the ⚙️ gear, and choose **Web app**.
2. Set:
   - **Description:** Panther Bob Games
   - **Execute as:** Me
   - **Who has access:** Anyone within *[your district]*. **Not "Anyone."**
     This setting is what replaces the old PIN.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
4. Test it: paste the URL into a new tab. You should see the home page.
   Add `?page=board` to the end and you should see the Jeopardy board.
5. **Test on a school device**, signed in as a student account if you can.

## Step 5 — Build the Google Site

1. Go to `sites.google.com` and create a new site named **Panther Bob Games**.
2. Make one page per game. For each page, open the page's **⋮ → Properties
   → Advanced** and set the **custom path** exactly as shown below. Matching
   paths are how the games' own buttons find each other.
3. On each page, click **Insert → Embed → By URL** and paste your Web app
   URL with that page's ending. Then drag the embed to full width and make
   it tall (about 900px; you'll judge by eye).

| Sites page | Custom path | Embed URL ending |
|---|---|---|
| Home | *(the home page)* | `?page=index` |
| Jeopardy Board | `board` | `?page=board` |
| Memory Match | `match` | `?page=match` |
| Speed Drill | `drill` | `?page=drill` |
| Wheel of Fortune | `wheel` | `?page=wheel` |
| Crossword | `crossword` | `?page=crossword` |
| Student Questions | `student-quiz` | `?page=student-quiz` |
| Solo Study | `study` | `?page=study` |
| Straight-Up Battle | `straightup` | `?page=straightup` |
| Straight-Up Battle Online | `straightup-online` | `?page=straightup-online` |
| Mystery Book | `mystery` | `?page=mystery` |
| Battle Bingo | `bingo` | `?page=bingo` |
| Two Truths and a Lie | `truthlie` | `?page=truthlie` |
| Author Pronunciations | `authors` | `?page=authors` |
| Submit a Question | `submit` | `?page=submit` |

**Don't** put Manage Questions or Review on the Site. Bookmark them instead:
`<your Web app URL>?page=admin` and `<your Web app URL>?page=review`.
Students who try those addresses see a "Teachers only" message.

4. Click **Publish** and choose to share with people in your district.
5. Copy the published Site address, for example
   `https://sites.google.com/yourdistrict.org/panther-bob-games`.

## Step 6 — Connect the Site address back to the app

1. In Apps Script, set `SITE_URL: "<your published Site address>",` in CONFIG
   and save.
2. Click **Deploy → Manage deployments**, click the ✏️ pencil, set
   **Version** to **New version**, and click **Deploy**.
   *(Always update this way. "New deployment" would give you a different URL
   and break every embed on the Site.)*
3. On the Site, click a game card on Home and a "🏠 All Games" button. Each
   one should open the matching Site page.
   - **If clicking does nothing:** set `LINKS_IN_NEW_TAB: true`, then redo
     Step 6.2. Links will open in a new tab instead.

---

## Day-to-day

**Changing a game:** edit it on GitHub as you do now. Netlify updates right
away, and Google picks the change up within about 15 minutes. To see it
right away, open `<Web app URL>?refresh=1` while signed in as a teacher.

**Adding a new game:** follow the README as usual. Then add its name to the
`PAGES` list in the Google copy of Code.gs, do Step 6.2, and add a Sites page
for it.

**If Code.gs itself changes on GitHub** (rare, only when Claude changes how
saving works): copy it into Apps Script again, re-enter your CONFIG
values, save, and do Step 6.2.

**Reviewing student questions:** use the Review page as before. You can also
read everything in the Sheet's "Student Submissions" tab.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Couldn't load this game" | GitHub couldn't be reached, or the repo went private. The repo must be public. If GitHub is down, a backup copy is used for up to 6 hours. |
| A teacher sees "Teachers only" | Their email must be in `TEACHER_EMAILS` (school address, same district), and you need to do Step 6.2 after editing. |
| Students get a Google sign-in or "no access" page | They need to be signed in to their school account. Check that "Who has access" is your district. |
| Online Battle feels slow or stops updating | Each screen checks for updates every 3 seconds, and Google limits how many requests a script handles at once. Try it with your real group size before game day. If it struggles, fewer screens should help: project one shared screen instead of one per student. |
| Saved progress (e.g. "don't repeat questions") resets | Some browsers block saving inside embedded pages. The games keep working, but the "no repeats" memory resets when the page closes. |
| Study guide PDF won't open | Upload the PDF to Google Drive, share it with your district, and put its link in `STUDY_GUIDE_URL`. Then do Step 6.2. |

## What's protected, and how

- **Who can open anything:** only signed-in accounts in your district,
  enforced by Google (Step 4).
- **Who can change questions, review submissions, or see pending ones:** only
  you and `TEACHER_EMAILS`. This is checked on the server, so going around
  the page doesn't work. (The old PIN couldn't protect the server side.)
- **Student names:** stored as first name and last initial only, and
  optional. Emails are never saved.
- **Spam:** each account can submit at most 15 questions an hour.
- **Sheet safety:** anything a student types is stored as plain text, so it
  can never run as a spreadsheet formula.
