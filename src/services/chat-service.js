'use strict';

const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const chatRepo = require('../repositories/chat');
const providerAccountsRepo = require('../repositories/provider-accounts');
const workspacesRepo = require('../repositories/workspaces');
const environmentsRepo = require('../repositories/environments');
const projectsRepo = require('../repositories/projects');

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

async function listChatSessions({ tenant, membership, user, workspaceId, environmentId, projectId }) {
  assertWorkspaceAccess(tenant, membership, user);
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');
  await validateWorkspaceScope(tenant.id, workspaceId, user.id);
  return chatRepo.listChatSessions(getPool(), tenant.id, workspaceId, user.id, {
    environmentId: environmentId || null,
    projectId: projectId || null
  });
}

async function validateWorkspaceScope(tenantId, workspaceId, userId) {
  const workspace = await workspacesRepo.getWorkspaceForTenantUser(getPool(), tenantId, workspaceId, userId);
  if (!workspace) {
    throw forbidden('workspace_forbidden', 'workspace does not belong to the current user scope');
  }
  return workspace;
}

async function resolveSessionScope({ tenantId, workspaceId, userId, environmentId, projectId }) {
  await validateWorkspaceScope(tenantId, workspaceId, userId);

  let environment = null;
  let project = null;

  if (environmentId) {
    environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
    if (!environment || environment.tenant_id !== tenantId || environment.workspace_id !== workspaceId) {
      throw badRequest('environment_scope_invalid', 'environment must belong to the selected workspace');
    }
  }

  if (projectId) {
    project = await projectsRepo.getProjectById(getPool(), projectId);
    if (!project || project.tenant_id !== tenantId || project.workspace_id !== workspaceId) {
      throw badRequest('project_scope_invalid', 'project must belong to the selected workspace');
    }
    if (environment && project.environment_id !== environment.id) {
      throw badRequest('project_environment_mismatch', 'project does not belong to the selected environment');
    }
    if (!environment) {
      environment = await environmentsRepo.getEnvironmentById(getPool(), project.environment_id);
    }
  }

  return {
    environmentId: environment?.id || null,
    projectId: project?.id || null
  };
}

async function createChatSession({ tenant, membership, user, workspaceId, environmentId, projectId, providerAccountId, title }) {
  assertWorkspaceAccess(tenant, membership, user);
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');
  const scope = await resolveSessionScope({
    tenantId: tenant.id,
    workspaceId,
    userId: user.id,
    environmentId,
    projectId
  });

  return chatRepo.createChatSession(getPool(), {
    tenantId: tenant.id,
    workspaceId,
    environmentId: scope.environmentId,
    projectId: scope.projectId,
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
      environmentId: session.environment_id,
      projectId: session.project_id,
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
