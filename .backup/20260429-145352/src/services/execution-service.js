'use strict';

const { getPool, withTransaction } = require('../db');
const { getProviderAdapter } = require('../providers');
const providerAccountsRepo = require('../repositories/provider-accounts');
const chatRepo = require('../repositories/chat');
const { prepareRuntimeDir, writeRuntimeFile } = require('../execution/runtime');
const { buildRunPrompt } = require('../execution/prompt');

async function appendRunEvent(db, runId, type, payload) {
  const seq = await chatRepo.nextRunEventSeq(db, runId);
  return chatRepo.createRunEvent(db, {
    runId,
    seq,
    type,
    payload
  });
}

async function claimNextRun() {
  return withTransaction(async (db) => {
    const run = await chatRepo.claimNextQueuedRun(db);
    if (!run) return null;

    await appendRunEvent(db, run.id, 'status', { label: 'running' });
    return run;
  });
}

async function completeRun(run, result, runtimeDir) {
  await withTransaction(async (db) => {
    await chatRepo.createMessage(db, {
      sessionId: run.session_id,
      role: 'assistant',
      content: {
        text: result.outputText,
        provider: run.provider,
        model: run.model
      }
    });

    await appendRunEvent(db, run.id, 'output', {
      text: result.outputText,
      provider: run.provider,
      model: run.model
    });

    await chatRepo.markRunCompleted(db, {
      runId: run.id,
      costUsd: result.costUsd,
      tokenUsage: result.tokenUsage,
      executionStats: {
        ...(result.executionStats || {}),
        runtimeDir
      }
    });

    await chatRepo.touchChatSession(db, run.session_id);
  });
}

async function failRun(run, error, runtimeDir) {
  await withTransaction(async (db) => {
    await appendRunEvent(db, run.id, 'error', {
      message: error.message
    });

    await chatRepo.createMessage(db, {
      sessionId: run.session_id,
      role: 'assistant',
      content: {
        text: `Run failed: ${error.message}`,
        provider: run.provider,
        model: run.model
      },
      errorCode: 'run_failed'
    });

    await chatRepo.markRunFailed(db, {
      runId: run.id,
      errorMessage: error.message,
      executionStats: {
        runtimeDir
      }
    });

    await chatRepo.touchChatSession(db, run.session_id);
  });
}

async function processRun(run) {
  const db = getPool();
  const hydrated = await chatRepo.getRunWithSession(db, run.id);
  if (!hydrated) {
    throw new Error(`run ${run.id} disappeared before execution`);
  }

  const providerAccount = await providerAccountsRepo.getProviderAccountById(db, hydrated.provider_account_id);
  if (!providerAccount) {
    throw new Error('provider account not found for run');
  }

  const messages = await chatRepo.listMessages(db, hydrated.session_id);
  const runtimeDir = prepareRuntimeDir(hydrated);
  const prompt = buildRunPrompt({
    session: hydrated,
    messages,
    runtimeDir
  });

  writeRuntimeFile(runtimeDir, 'prompt.txt', prompt);

  const adapter = getProviderAdapter(hydrated.provider);
  if (!adapter) {
    throw new Error(`provider ${hydrated.provider} is not supported`);
  }

  const result = await adapter.startRun({
    run: hydrated,
    session: hydrated,
    providerAccount: {
      id: providerAccount.id,
      provider: providerAccount.provider,
      mode: providerAccount.mode,
      config: providerAccount.config_json || {},
      encryptedSecretRef: providerAccount.encrypted_secret_ref
    },
    prompt,
    model: hydrated.model,
    runtimeDir,
    onEvent: async (type, payload) => {
      await withTransaction((tx) => appendRunEvent(tx, hydrated.id, type, payload));
    }
  });

  writeRuntimeFile(runtimeDir, 'result.json', JSON.stringify(result.rawOutput || {}, null, 2));
  writeRuntimeFile(runtimeDir, 'assistant.txt', result.outputText || '');

  await completeRun(hydrated, result, runtimeDir);
  return {
    runId: hydrated.id,
    status: 'completed'
  };
}

async function processNextRun() {
  const run = await claimNextRun();
  if (!run) {
    return null;
  }

  const runtimeDir = prepareRuntimeDir(run);
  try {
    return await processRun(run);
  } catch (error) {
    await failRun(run, error, runtimeDir);
    return {
      runId: run.id,
      status: 'failed',
      error: error.message
    };
  }
}

module.exports = {
  processNextRun
};
