'use strict';

const { spawn } = require('child_process');
const config = require('../config');
const { decryptSecret } = require('../secrets');

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' }
];

function resolveSecret(providerAccount) {
  if (providerAccount.encryptedSecretRef) {
    return decryptSecret(providerAccount.encryptedSecretRef);
  }
  if (providerAccount.mode === 'platform_managed' && config.platformManagedAnthropicKey) {
    return config.platformManagedAnthropicKey;
  }
  throw new Error('missing Claude Code credential');
}

const adapter = {
  provider: 'claude_code',

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
    return CLAUDE_MODELS;
  },

  async startRun({ providerAccount, prompt, model, runtimeDir, onEvent }) {
    const secret = resolveSecret(providerAccount);
    const resolvedModel = !model || model === 'default'
      ? providerAccount.config?.defaultModel || 'claude-sonnet-4-20250514'
      : model;
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--permission-mode',
      'bypassPermissions',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--bare',
      '--add-dir',
      runtimeDir,
      '--model',
      resolvedModel
    ];

    const result = await new Promise((resolve, reject) => {
      const child = spawn('claude', args, {
        cwd: runtimeDir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: secret
        }
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude Code timed out after ${config.providerTimeoutMs}ms`));
      }, config.providerTimeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(new Error(`failed to parse Claude output: ${err.message}`));
        }
      });
    });

    if (onEvent) {
      await onEvent('provider_result', {
        provider: 'claude_code',
        sessionId: result.session_id || null,
        durationMs: result.duration_ms || null
      });
    }

    return {
      outputText: result.result || '',
      rawOutput: result,
      tokenUsage: result.usage || {},
      costUsd: null,
      executionStats: {
        sessionId: result.session_id || null,
        durationMs: result.duration_ms || null,
        providerMode: providerAccount.mode,
        outputLength: String(result.result || '').length
      }
    };
  },

  async cancelRun() {
    return;
  }
};

module.exports = { adapter };
