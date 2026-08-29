# InspectBot — Ship Walkway Safety Inspection Chatbot

A Claude-powered chat app that walks a ship Inspector through the "General
Checks" walkway safety checklist one item at a time, accepts text + photo
evidence in any order, resolves out-of-order/location-based findings the way
the source rule set specifies, and writes a chronological Markdown audit log
you can download at any time.

## How it works

- **Backend**: Node.js + Express (`server.js`). Every chat turn is sent to the
  Anthropic Messages API with a fixed `system` prompt (`systemPrompt.js`) that
  encodes the full checklist, the state-machine rules (Pending / Mixed /
  Conflict), and the required loop:
  1. Prompt one checklist item.
  2. Receive the Inspector's reply (text and/or photos).
  3. Ask the standard question: **"Anything more to add, or shall we proceed
     to the next item?"**
  4. Only advance to the next unanswered item once the Inspector confirms
     ("OK" / "proceed" / etc.) with no new data attached.
- Every message (Inspector and InspectBot) is appended, in order, with a
  timestamp, to `data/logs/<sessionId>.md`. Uploaded photos are saved to
  `data/uploads/<sessionId>/` and embedded inline in the log.
- **Frontend**: a plain HTML/CSS/JS chat UI (`public/`) — no build step
  required. It supports attaching multiple photos per message and a
  "Download Report (.md)" button.

## Project structure

```
ship-inspector-app/
  server.js              Express server + Claude API calls
  systemPrompt.js         InspectBot's rule set (system prompt)
  package.json
  render.yaml              Render.com blueprint (optional one-click deploy)
  .env.example
  public/
    index.html
    style.css
    app.js
  data/
    uploads/               Photo evidence (created at runtime)
    logs/                  Chronological .md audit logs (created at runtime)
```

## 1. Run locally (optional, to test before deploying)

Requires Node.js 18+.

```bash
cd ship-inspector-app
cp .env.example .env
# edit .env and paste your real ANTHROPIC_API_KEY
npm install
npm start
```

Open http://localhost:3000 — InspectBot should greet you and prompt Item 1.

## 2. Deploy to Render.com

### Step A — Push this folder to a GitHub repo

```bash
cd ship-inspector-app
git init
git add .
git commit -m "InspectBot initial commit"
# create an empty repo on GitHub first, then:
git remote add origin https://github.com/<your-username>/ship-inspector-app.git
git branch -M main
git push -u origin main
```

(Do **not** commit your `.env` file — it's already git-ignored. Your API key
goes into Render's dashboard, not into the repo.)

### Step B — Create the Web Service on Render

**Option 1 — Blueprint (uses the included `render.yaml`):**
1. Go to https://dashboard.render.com → **New** → **Blueprint**.
2. Connect your GitHub account and select the `ship-inspector-app` repo.
3. Render reads `render.yaml` and proposes a Web Service named
   `ship-inspector-app` with a 1GB persistent disk mounted at `data/`.
4. Click **Apply**. When prompted for the `ANTHROPIC_API_KEY` secret, paste
   your key (see Step C).

**Option 2 — Manual setup:**
1. Go to https://dashboard.render.com → **New** → **Web Service**.
2. Connect the repo.
3. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or any paid tier for always-on)
4. **About persistent storage**: Render's **Free** instance type does not
   support Disks — if you try to attach one on Free, you'll get a storage
   allocation error. On Free, just skip the Disks tab entirely; the app
   still works, but uploaded photos and `.md` logs are stored on local disk
   and will be lost whenever the service restarts or spins down from
   inactivity. If you later upgrade to a paid plan (Starter/$7+ or above),
   add a **Disk** under the service's *Disks* tab — name `inspectbot-data`,
   mount path `/opt/render/project/src/data`, size 1GB — to persist data
   across restarts/deploys.

### Step C — Set your Claude API key as a Secret

1. In the Render dashboard, open your new service.
2. Go to **Environment** (left sidebar).
3. Add an environment variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (from https://console.anthropic.com)
   - Check the padlock icon to store it as a **secret** (hidden value).
4. Optionally add `CLAUDE_MODEL` = `claude-sonnet-5` (already defaulted in
   code, so this is optional — set it only if you want a different model
   string).
5. Click **Save Changes** — Render will redeploy automatically.

### Step D — Open the app

Render gives you a URL like `https://ship-inspector-app.onrender.com`. Open
it, and InspectBot will greet the Inspector and prompt Item 1.

## Notes & limitations

- **Free tier sleep & storage**: Render's free instances spin down after
  inactivity; the first request after idling will be slow (cold start), and
  the local filesystem resets — both in-memory conversation state AND the
  `data/uploads` / `data/logs` files are lost on that restart, since Disks
  (persistent storage) aren't available on Free. Download your `.md` report
  before a long idle period if you need to keep it. Upgrade to a paid plan
  and attach a Disk (see `render.yaml`, commented out) to make everything
  persistent.
- **Sessions**: each browser gets a `sessionId` stored in `localStorage`. To
  start a brand-new inspection, clear site data / local storage, or open the
  app in a private window.
- **Image size**: uploads are capped at 8MB each, 6 images per message
  (adjustable in `server.js`, the `multer` config and the `images` field
  limit).
- **Multiple inspectors / concurrent inspections**: each session is
  independent, so multiple devices can run separate inspections against the
  same deployment simultaneously.
- To reset everything, delete the files under `data/uploads/` and
  `data/logs/` (or just clear the Render disk).
