// server.js
// InspectBot backend: Express + Anthropic Claude API.
// Handles chat turns (text + optional images), keeps per-session
// conversation history in memory, and writes a chronological
// Markdown audit log to disk for each session.

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

if (!ANTHROPIC_API_KEY) {
  console.warn('[WARN] ANTHROPIC_API_KEY is not set. Set it in your environment / Render secrets.');
}

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
for (const dir of [DATA_DIR, UPLOADS_DIR, LOGS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---- In-memory session store -----------------------------------------
// sessions[sessionId] = { history: [ {role, content} ... ], mdPath, createdAt }
const sessions = {};

function sessionUploadDir(sessionId) {
  const dir = path.join(UPLOADS_DIR, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mdLogPath(sessionId) {
  return path.join(LOGS_DIR, `${sessionId}.md`);
}

function ensureSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      history: [],
      mdPath: mdLogPath(sessionId),
      createdAt: new Date().toISOString(),
    };
    const header =
      `# Ship Walkway Safety Inspection — Audit Log\n\n` +
      `Session ID: \`${sessionId}\`\n\n` +
      `Started: ${new Date().toISOString()}\n\n` +
      `---\n\n`;
    fs.writeFileSync(sessions[sessionId].mdPath, header, 'utf8');
  }
  return sessions[sessionId];
}

function appendToLog(sessionId, entry) {
  fs.appendFileSync(mdLogPath(sessionId), entry, 'utf8');
}

function timestamp() {
  return new Date().toISOString();
}

// ---- Multer (image upload) --------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.sessionId || 'unknown-session';
    cb(null, sessionUploadDir(sessionId));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per image
});

// ---- Anthropic API call -------------------------------------------------
async function callClaude(history) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const textParts = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text);
  return textParts.join('\n').trim();
}

function imageToMediaBlock(file) {
  const bytes = fs.readFileSync(file.path);
  const base64 = bytes.toString('base64');
  const mediaType = file.mimetype || 'image/jpeg';
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  };
}

// ---- Routes ---------------------------------------------------------

// Start / resume a session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  ensureSession(sessionId);
  res.json({ sessionId });
});

// Send a chat turn: text (optional) + images (optional, multipart)
app.post('/api/message', upload.array('images', 6), async (req, res) => {
  try {
    const { sessionId, text } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });

    const session = ensureSession(sessionId);
    const files = req.files || [];
    const userText = (text || '').trim();

    if (!userText && files.length === 0) {
      return res.status(400).json({ error: 'Provide text and/or at least one image.' });
    }

    // Build the Claude message content blocks
    const contentBlocks = [];
    if (userText) contentBlocks.push({ type: 'text', text: userText });
    for (const f of files) contentBlocks.push(imageToMediaBlock(f));

    session.history.push({ role: 'user', content: contentBlocks });

    // ---- Log the Inspector's input chronologically ----
    let logEntry = `## Inspector — ${timestamp()}\n\n`;
    if (userText) logEntry += `${userText}\n\n`;
    for (const f of files) {
      const relPath = `../uploads/${sessionId}/${path.basename(f.path)}`;
      logEntry += `![evidence](${relPath})\n\n`;
    }
    appendToLog(sessionId, logEntry);

    // ---- Call Claude ----
    const reply = await callClaude(session.history);
    session.history.push({ role: 'assistant', content: [{ type: 'text', text: reply }] });

    appendToLog(sessionId, `## InspectBot — ${timestamp()}\n\n${reply}\n\n---\n\n`);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Fetch chat history (for reloading UI on refresh)
app.get('/api/history/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Flatten to a simple text-only shape for the UI
  const simplified = session.history.map((m) => ({
    role: m.role,
    text: (m.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n'),
    hasImages: (m.content || []).some((b) => b.type === 'image'),
  }));
  res.json({ history: simplified });
});

// Download the chronological Markdown report
app.get('/api/report/:sessionId', (req, res) => {
  const filePath = mdLogPath(req.params.sessionId);
  if (!fs.existsSync(filePath)) return res.status(404).send('Report not found');
  res.download(filePath, `inspection-report-${req.params.sessionId}.md`);
});

app.get('/healthz', (_req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`InspectBot server running on port ${PORT}`);
});
