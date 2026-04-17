'use strict';

const { spawn } = require('child_process');

/**
 * Streams a Claude Code response via the CLI.
 * Uses `claude -p --output-format stream-json --verbose` for real-time streaming.
 *
 * @param {string} prompt - User message
 * @param {object} opts
 * @param {string} [opts.sessionId] - Resume a previous Claude session
 * @param {string} [opts.cwd] - Working directory for Claude
 * @param {(event: object) => void} opts.onEvent - Called for each stream event
 * @param {AbortSignal} [opts.signal] - Abort signal to cancel
 * @returns {Promise<{result: string, sessionId: string, costUsd: number, durationMs: number}>}
 */
function streamClaude({ prompt, sessionId, cwd, onEvent, signal }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (sessionId) {
      args.push('-r', sessionId);
    }

    const proc = spawn('claude', args, {
      cwd: cwd || process.env.HOME,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let fullResult = '';
    let resultSessionId = sessionId || '';
    let costUsd = 0;
    let durationMs = 0;
    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          onEvent(event);

          if (event.type === 'assistant' && event.message) {
            // Extract text content from the message
            const content = event.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') {
                  fullResult += block.text;
                }
              }
            }
          }

          if (event.type === 'result') {
            resultSessionId = event.session_id || resultSessionId;
            costUsd = event.total_cost_usd || 0;
            durationMs = event.duration_ms || 0;
            if (event.result) fullResult = event.result;
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    let stderrBuf = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on('close', (code) => {
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          onEvent(event);
          if (event.type === 'result') {
            resultSessionId = event.session_id || resultSessionId;
            costUsd = event.total_cost_usd || 0;
            durationMs = event.duration_ms || 0;
            if (event.result) fullResult = event.result;
          }
        } catch (e) {}
      }

      if (code !== 0 && !fullResult) {
        reject(new Error(`Claude exited with code ${code}: ${stderrBuf}`));
      } else {
        resolve({
          result: fullResult,
          sessionId: resultSessionId,
          costUsd,
          durationMs,
        });
      }
    });

    proc.on('error', reject);

    if (signal) {
      signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
      });
    }
  });
}

/**
 * Simple non-streaming call to Claude Code CLI.
 */
async function askClaude(prompt, opts = {}) {
  const args = ['-p', prompt, '--output-format', 'json'];
  if (opts.sessionId) args.push('-r', opts.sessionId);

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: opts.cwd || process.env.HOME,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => stdout += d);
    proc.stderr.on('data', (d) => stderr += d);

    proc.on('close', (code) => {
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        if (code !== 0) reject(new Error(stderr || `Exit code ${code}`));
        else resolve({ result: stdout, session_id: '', total_cost_usd: 0, duration_ms: 0 });
      }
    });

    proc.on('error', reject);
  });
}

module.exports = { streamClaude, askClaude };
