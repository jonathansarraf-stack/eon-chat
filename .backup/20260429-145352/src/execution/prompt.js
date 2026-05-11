'use strict';

const config = require('../config');

function normalizeText(value) {
  return String(value || '').trim();
}

function asPlainText(message) {
  const payload = message.content_json || {};
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  return JSON.stringify(payload);
}

function buildRunPrompt({ session, messages, runtimeDir }) {
  const transcript = messages
    .map((message) => {
      const role = String(message.role || 'user').toUpperCase();
      return `${role}:\n${asPlainText(message)}`;
    })
    .join('\n\n')
    .slice(-config.runMaxPromptChars);

  return normalizeText(`
You are executing an isolated tenant run for Eon Chat.

Rules:
- Work only inside this runtime directory: ${runtimeDir}
- If you create or modify files, mention the relative paths in your final answer.
- Keep the final answer concise and directly useful to the user.

Session title: ${session.title || 'Untitled'}

Conversation transcript:
${transcript}
  `);
}

module.exports = {
  buildRunPrompt
};
