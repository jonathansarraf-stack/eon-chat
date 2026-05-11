'use strict';

const config = require('../config');
const { decryptSecret } = require('../secrets');

const CODEX_MODELS = [
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'codex-mini-latest', label: 'Codex Mini Latest' }
];

function resolveSecret(providerAccount) {
  if (providerAccount.encryptedSecretRef) {
    return decryptSecret(providerAccount.encryptedSecretRef);
  }
  if (providerAccount.mode === 'platform_managed' && config.platformManagedOpenAiKey) {
    return config.platformManagedOpenAiKey;
  }
  throw new Error('missing Codex credential');
}

function extractText(response) {
  if (response.output_text) return response.output_text;
  if (!Array.isArray(response.output)) return '';

  const chunks = [];
  for (const item of response.output) {
    if (!Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type === 'output_text' && part.text) chunks.push(part.text);
      if (part.type === 'text' && part.text) chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

const adapter = {
  provider: 'codex',

  async validateCredentials(providerAccount) {
    try {
      const secret = resolveSecret(providerAccount);
      if (!secret || secret.length < 20) {
        return { ok: false, error: 'invalid_credentials' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'invalid_credentials' };
    }
  },

  async listModels() {
    return CODEX_MODELS;
  },

  async startRun({ providerAccount, prompt, model, onEvent }) {
    const secret = resolveSecret(providerAccount);
    const resolvedModel = !model || model === 'default'
      ? providerAccount.config?.defaultModel || 'gpt-5.3-codex'
      : model;
    const timeoutSignal = AbortSignal.timeout(config.providerTimeoutMs);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: timeoutSignal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({
        model: resolvedModel,
        input: prompt,
        metadata: {
          source: 'eon-chat-control-plane'
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || 'OpenAI request failed';
      throw new Error(message);
    }

    const text = extractText(payload);
    if (onEvent) {
      await onEvent('provider_result', {
        provider: 'codex',
        model: payload.model || resolvedModel,
        responseId: payload.id || null
      });
    }

    return {
      outputText: text,
      rawOutput: payload,
      tokenUsage: payload.usage || {},
      costUsd: null,
      executionStats: {
        endpoint: '/v1/responses',
        providerMode: providerAccount.mode,
        outputLength: text.length
      }
    };
  },

  async cancelRun() {
    return;
  }
};

module.exports = { adapter };
