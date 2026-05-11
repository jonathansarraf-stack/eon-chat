'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  };
}

function loadService(overrides = {}) {
  const servicePath = require.resolve('../src/services/ops-service');
  const dbPath = require.resolve('../src/db');
  const chatRepoPath = require.resolve('../src/repositories/chat');
  const notificationsRepoPath = require.resolve('../src/repositories/notifications');
  const auditRepoPath = require.resolve('../src/repositories/audit');

  delete require.cache[servicePath];
  delete require.cache[dbPath];
  delete require.cache[chatRepoPath];
  delete require.cache[notificationsRepoPath];
  delete require.cache[auditRepoPath];

  mockModule('../src/db', {
    getPool: overrides.getPool || (() => ({ kind: 'pool' })),
    withTransaction: overrides.withTransaction || (async (fn) => fn({ kind: 'tx' }))
  });

  mockModule('../src/repositories/chat', {
    summarizeRunsQueue: overrides.summarizeRunsQueue || (async () => ({ queued: 0, running: 0 })),
    listRecentProblemRuns: overrides.listRecentProblemRuns || (async () => []),
    getRunById: overrides.getRunById || (async () => null),
    createRun: overrides.createRun || (async () => ({ id: 'run_retry_123' })),
    createRunEvent: overrides.createRunEvent || (async () => ({ id: 'evt_123' }))
  });

  mockModule('../src/repositories/notifications', {
    summarizeEmailOutbox: overrides.summarizeEmailOutbox || (async () => ({ pending: 0, failed: 0 })),
    listRecentProblemEmails: overrides.listRecentProblemEmails || (async () => []),
    getEmailOutboxEntryById: overrides.getEmailOutboxEntryById || (async () => null),
    createEmailOutboxEntry: overrides.createEmailOutboxEntry || (async () => ({ id: 'mail_retry_123' }))
  });

  mockModule('../src/repositories/audit', {
    createAuditLog: overrides.createAuditLog || (async () => ({ id: 'audit_123' }))
  });

  return require('../src/services/ops-service');
}

test('getQueueHealth allows tenant admins with tenant scope', async () => {
  let capturedTenantId = null;
  const opsService = loadService({
    summarizeRunsQueue: async (_db, input) => {
      capturedTenantId = input.tenantId;
      return { queued: 3, running: 1 };
    }
  });

  const result = await opsService.getQueueHealth({
    user: { id: 'user_123', globalRole: 'user' },
    tenant: { id: 'tenant_123' },
    membership: { role: 'admin', status: 'active' }
  });

  assert.equal(result.scope, 'tenant');
  assert.equal(capturedTenantId, 'tenant_123');
});

test('getQueueHealth allows support admins with global scope', async () => {
  let capturedTenantId = 'not-set';
  const opsService = loadService({
    summarizeRunsQueue: async (_db, input) => {
      capturedTenantId = input.tenantId;
      return { queued: 10, running: 2 };
    }
  });

  const result = await opsService.getQueueHealth({
    user: { id: 'user_999', globalRole: 'support_admin' },
    tenant: null,
    membership: null
  });

  assert.equal(result.scope, 'global');
  assert.equal(capturedTenantId, null);
});

test('getQueueHealth rejects non-admin tenant members', async () => {
  const opsService = loadService();

  await assert.rejects(
    opsService.getQueueHealth({
      user: { id: 'user_123', globalRole: 'user' },
      tenant: { id: 'tenant_123' },
      membership: { role: 'developer', status: 'active' }
    }),
    (error) => {
      assert.equal(error.code, 'ops_forbidden');
      return true;
    }
  );
});

test('retryFailedEmail clones failed email and audits action', async () => {
  let auditAction = null;
  const opsService = loadService({
    getEmailOutboxEntryById: async () => ({
      id: 'mail_1',
      kind: 'tenant_invite',
      to_email: 'dev@acme.com',
      subject: 'Invite',
      template: 'tenant_invite',
      payload_json: { inviteUrl: 'https://example.com' },
      status: 'failed'
    }),
    createEmailOutboxEntry: async (_db, input) => ({
      id: 'mail_2',
      ...input
    }),
    createAuditLog: async (_db, input) => {
      auditAction = input.action;
      return { id: 'audit_123' };
    }
  });

  const result = await opsService.retryFailedEmail({
    user: { id: 'user_ops', globalRole: 'support_admin' },
    tenant: null,
    membership: null,
    emailId: 'mail_1'
  });

  assert.equal(result.retriedFromEmailId, 'mail_1');
  assert.equal(result.queuedEmailId, 'mail_2');
  assert.equal(auditAction, 'ops.retry_email');
});

test('requeueRun clones failed run and audits action', async () => {
  let createdRun = null;
  const opsService = loadService({
    getRunById: async () => ({
      id: 'run_1',
      tenant_id: 'tenant_123',
      workspace_id: 'ws_123',
      session_id: 'session_123',
      provider_account_id: 'provider_123',
      provider: 'codex',
      model: 'gpt-5.4',
      status: 'failed',
      execution_stats_json: { runtimeDir: '/tmp/run_1' }
    }),
    createRun: async (_db, input) => {
      createdRun = input;
      return { id: 'run_2' };
    }
  });

  const result = await opsService.requeueRun({
    user: { id: 'user_ops', globalRole: 'support_admin' },
    tenant: null,
    membership: null,
    runId: 'run_1'
  });

  assert.equal(result.retriedFromRunId, 'run_1');
  assert.equal(result.queuedRunId, 'run_2');
  assert.equal(createdRun.executionStats.retryOfRunId, 'run_1');
});
