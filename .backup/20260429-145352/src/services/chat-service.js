'use strict';

const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const chatRepo = require('../repositories/chat');
const providerAccountsRepo = require('../repositories/provider-accounts');

function assertWorkspaceAccess(tenant, membership, user) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  if (!membership || membership.status !== 'active') {
    throw forbidden('workspace_forbidden', 'active tenant membership required');
  }
  if (!user) {
    throw forbidden('auth_required', 'authentication required');
  }
}

async function listChatSessions({ tenant, membership, user, workspaceId }) {
  assertWorkspaceAccess(tenant, membership, user);
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');
  return chatRepo.listChatSessions(getPool(), tenant.id, workspaceId, user.id);
}

async function createChatSession({ tenant, membership, user, workspaceId, providerAccountId, title }) {
  assertWorkspaceAccess(tenant, membership, user);
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');

  return chatRepo.createChatSession(getPool(), {
    tenantId: tenant.id,
    workspaceId,
    userId: user.id,
    providerAccountId: providerAccountId || null,
    title,
    metadata: {}
  });
}

async function getSessionOrThrow(sessionId) {
  const session = await chatRepo.getChatSession(getPool(), sessionId);
  if (!session) throw notFound('session_not_found', 'chat session not found');
  return session;
}

async function listMessages({ tenant, membership, user, sessionId }) {
  assertWorkspaceAccess(tenant, membership, user);
  const session = await getSessionOrThrow(sessionId);
  if (session.tenant_id !== tenant.id || session.user_id !== user.id) {
    throw forbidden('session_forbidden', 'session does not belong to current user in this tenant');
  }
  return chatRepo.listMessages(getPool(), sessionId);
}

async function listRuns({ tenant, membership, user, sessionId }) {
  assertWorkspaceAccess(tenant, membership, user);
  const session = await getSessionOrThrow(sessionId);
  if (session.tenant_id !== tenant.id || session.user_id !== user.id) {
    throw forbidden('session_forbidden', 'session does not belong to current user in this tenant');
  }
  return chatRepo.listRuns(getPool(), sessionId);
}

async function listRunEvents({ tenant, membership, user, sessionId, runId }) {
  assertWorkspaceAccess(tenant, membership, user);
  const session = await getSessionOrThrow(sessionId);
  if (session.tenant_id !== tenant.id || session.user_id !== user.id) {
    throw forbidden('session_forbidden', 'session does not belong to current user in this tenant');
  }

  const runs = await chatRepo.listRuns(getPool(), sessionId);
  const run = runs.find((entry) => entry.id === runId);
  if (!run) {
    throw notFound('run_not_found', 'run not found for this session');
  }

  return chatRepo.listRunEvents(getPool(), runId);
}

async function queueRun({ tenant, membership, user, sessionId, prompt, providerAccountId, model }) {
  assertWorkspaceAccess(tenant, membership, user);
  if (!prompt) throw badRequest('prompt_required', 'prompt is required');

  const session = await getSessionOrThrow(sessionId);
  if (session.tenant_id !== tenant.id || session.user_id !== user.id) {
    throw forbidden('session_forbidden', 'session does not belong to current user in this tenant');
  }

  const providerAccount = await providerAccountsRepo.getProviderAccountById(getPool(), providerAccountId || session.provider_account_id);
  if (!providerAccount || providerAccount.tenant_id !== tenant.id) {
    throw badRequest('provider_account_required', 'valid providerAccountId is required');
  }

  return withTransaction(async (db) => {
    const userMessage = await chatRepo.createMessage(db, {
      sessionId,
      role: 'user',
      content: { text: prompt }
    });

    const run = await chatRepo.createRun(db, {
      tenantId: tenant.id,
      workspaceId: session.workspace_id,
      sessionId,
      providerAccountId: providerAccount.id,
      provider: providerAccount.provider,
      model: model || providerAccount.config_json?.defaultModel || 'default',
      executionStats: { queueReason: 'awaiting_execution_plane' }
    });

    await chatRepo.createRunEvent(db, {
      runId: run.id,
      seq: 1,
      type: 'status',
      payload: { label: 'queued' }
    });

    await chatRepo.touchChatSession(db, sessionId);

    return {
      message: userMessage,
      run
    };
  });
}

module.exports = {
  listChatSessions,
  createChatSession,
  listMessages,
  listRuns,
  listRunEvents,
  queueRun
};
