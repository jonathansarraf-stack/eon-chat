'use strict';

const express = require('express');
const cors = require('cors');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { streamClaude } = require('./claude');
const { getAuthStatus } = require('./auth');
const { checkLicense, requireLicense } = require('./license');
const stripeRouter = require('./stripe');

const app = express();
app.use(cors());
app.use(express.json());
app.use(requireLicense);

const PORT = process.env.EON_PORT || 3777;

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── License / Stripe ────────────────────────────────────────────────────────
app.use('/api/license', stripeRouter);

// ── Auth ────────────────────────────────────────────────────────────────────
app.get('/api/auth/status', (req, res) => {
  const status = getAuthStatus();
  if (status) {
    res.json(status);
  } else {
    res.json({
      loggedIn: false,
      message: 'Run "claude login" in your terminal to authenticate.',
    });
  }
});

// ── Sessions CRUD ───────────────────────────────────────────────────────────

// List sessions
app.get('/api/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.id, s.title, s.created_at AS created, s.updated_at AS updated,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS messageCount,
      (SELECT m.text FROM messages m WHERE m.session_id = s.id ORDER BY m.ts DESC LIMIT 1) AS snippet
    FROM sessions s
    ORDER BY s.updated_at DESC
  `).all();
  res.json(sessions);
});

// Create session
app.post('/api/sessions', (req, res) => {
  const id = uuid();
  const title = req.body.title || 'Nova conversa';
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, title, now, now);
  res.json({ id, title, created: now, updated: now, messageCount: 0, snippet: '' });
});

// Rename session
app.patch('/api/sessions/:id', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), req.params.id);
  res.json({ ok: true });
});

// Delete session
app.delete('/api/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Messages ────────────────────────────────────────────────────────────────

// Get messages for a session
app.get('/api/sessions/:id/messages', (req, res) => {
  const messages = db.prepare(`
    SELECT id, role, text, ts, duration_ms AS durationMs, cost_usd AS costUsd, is_error AS isError
    FROM messages WHERE session_id = ? ORDER BY ts ASC
  `).all(req.params.id);
  res.json(messages);
});

// ── Chat (streaming via SSE) ────────────────────────────────────────────────

// Map session IDs to Claude session IDs for context resumption
const claudeSessionMap = {};

app.post('/api/sessions/:id/chat', (req, res) => {
  const { text } = req.body;
  const sessionId = req.params.id;

  if (!text) return res.status(400).json({ error: 'text required' });

  // Verify session exists
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  // Save user message
  const now = Date.now();
  const userMsg = db.prepare(
    'INSERT INTO messages (session_id, role, text, ts) VALUES (?, ?, ?, ?)'
  ).run(sessionId, 'user', text, now);

  // Update session
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 5000);

  // Clean up heartbeat on close
  res.on('close', () => clearInterval(heartbeat));

  // Send back the saved user message
  sendSSE('user_message', {
    id: userMsg.lastInsertRowid,
    role: 'user',
    text,
    ts: now,
  });

  const abortController = new AbortController();
  res.on('close', () => {
    console.log('[chat] client disconnected');
    abortController.abort();
  });

  let assistantText = '';
  const startTime = Date.now();

  streamClaude({
    prompt: text,
    sessionId: claudeSessionMap[sessionId],
    cwd: process.env.EON_CWD || process.env.HOME,
    signal: abortController.signal,
    onEvent: (event) => {
      // Forward tool use events for activity log
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            sendSSE('activity', {
              tool: block.name,
              label: `${block.name}: ${truncate(JSON.stringify(block.input), 60)}`,
              icon: toolIcon(block.name),
              done: false,
            });
          }
          if (block.type === 'text') {
            assistantText += block.text;
            sendSSE('text_delta', { text: block.text });
          }
        }
      }

      // Tool result events
      if (event.type === 'tool_result') {
        sendSSE('activity', {
          tool: event.tool_name || 'tool',
          label: `${event.tool_name || 'tool'}: concluído`,
          icon: toolIcon(event.tool_name),
          done: true,
        });
      }

      // Result event
      if (event.type === 'result') {
        if (event.result && !assistantText) {
          assistantText = event.result;
        }
      }
    },
  })
    .then(({ result, sessionId: claudeId, costUsd, durationMs }) => {
      // Store claude session mapping
      if (claudeId) claudeSessionMap[sessionId] = claudeId;

      const finalText = assistantText || result || '';
      const endTime = Date.now();
      const actualDuration = durationMs || (endTime - startTime);

      // Save assistant message
      const assistantMsg = db.prepare(
        'INSERT INTO messages (session_id, role, text, ts, duration_ms, cost_usd) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(sessionId, 'assistant', finalText, Date.now(), actualDuration, costUsd);

      // Update session
      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), sessionId);

      // Auto-title: if session is "Nova conversa" and this is first exchange, generate title
      const sess = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId);
      if (sess && sess.title === 'Nova conversa') {
        const shortTitle = finalText.slice(0, 50).split('\n')[0].replace(/[#*`]/g, '').trim();
        if (shortTitle) {
          db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(shortTitle, sessionId);
          sendSSE('title_update', { title: shortTitle });
        }
      }

      sendSSE('done', {
        id: assistantMsg.lastInsertRowid,
        role: 'assistant',
        text: finalText,
        ts: Date.now(),
        durationMs: actualDuration,
        costUsd,
      });

      clearInterval(heartbeat);
      res.end();
    })
    .catch((err) => {
      if (abortController.signal.aborted) {
        sendSSE('cancelled', { reason: 'aborted' });
      } else {
        // Save error as message
        const errText = `Erro: ${err.message}`;
        db.prepare(
          'INSERT INTO messages (session_id, role, text, ts, is_error) VALUES (?, ?, ?, ?, 1)'
        ).run(sessionId, 'assistant', errText, Date.now());

        sendSSE('error', { message: err.message });
      }
      clearInterval(heartbeat);
      res.end();
    });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function toolIcon(name) {
  const icons = {
    Read: '📄', Edit: '✏️', Write: '📝', Bash: '⚡',
    Grep: '🔍', Glob: '📂', WebSearch: '🌐', WebFetch: '🌐',
  };
  return icons[name] || '🔧';
}

// ── Start ───────────────────────────────────────────────────────────────────
async function start() {
  // Check license on startup
  const license = await checkLicense();
  console.log(`[license] status: ${license?.status || 'unchecked'}`);

  // Check Claude auth
  const auth = getAuthStatus();
  if (auth) {
    console.log(`[auth] logged in as ${auth.email} (${auth.subscriptionType})`);
  } else {
    console.warn('[auth] Claude not authenticated. Run: claude login');
  }

  app.listen(PORT, () => {
    console.log(`[eon-chat-server] running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
