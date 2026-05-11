'use strict';

const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const chatRepo = require('../repositories/chat');
const notificationsRepo = require('../repositories/notifications');
const auditRepo = require('../repositories/audit');

const TENANT_ADMIN_ROLES = new Set(['owner', 'admin', 'billing_admin']);
const GLOBAL_OPS_ROLES = new Set(['support_admin', 'platform_admin']);

function resolveOpsScope({ user, tenant, membership }) {
  if (!user) {
    throw forbidden('ops_forbidden', 'authenticated user required');
  }
  if (GLOBAL_OPS_ROLES.has(user.globalRole)) {
    return { scope: 'global', tenantId: null };
  }
  if (tenant && membership && membership.status === 'active' && TENANT_ADMIN_ROLES.has(membership.role)) {
    return { scope: 'tenant', tenantId: tenant.id };
  }
  throw forbidden('ops_forbidden', 'support, platform, or tenant admin role required');
}

async function getQueueHealth({ user, tenant, membership }) {
  const scope = resolveOpsScope({ user, tenant, membership });
  const pool = getPool();

  const [runs, recentProblemRuns, emails, recentProblemEmails] = await Promise.all([
    chatRepo.summarizeRunsQueue(pool, { tenantId: scope.tenantId }),
    chatRepo.listRecentProblemRuns(pool, { tenantId: scope.tenantId, limit: 5 }),
    notificationsRepo.summarizeEmailOutbox(pool),
    notificationsRepo.listRecentProblemEmails(pool, 5)
  ]);

  return {
    scope: scope.scope,
    tenantId: scope.tenantId,
    runs,
    recentProblemRuns,
    emails,
    recentProblemEmails
  };
}

async function retryFailedEmail({ user, tenant, membership, emailId }) {
  const scope = resolveOpsScope({ user, tenant, membership });
  if (!emailId) {
    throw badRequest('email_id_required', 'email id is required');
  }

  return withTransaction(async (db) => {
    const original = await notificationsRepo.getEmailOutboxEntryById(db, emailId);
    if (!original) {
      throw notFound('email_not_found', 'email outbox entry not found');
    }
    if (original.status !== 'failed') {
      throw badRequest('email_retry_invalid_status', 'only failed emails can be retried');
    }

    const cloned = await notificationsRepo.createEmailOutboxEntry(db, {
      kind: original.kind,
      toEmail: original.to_email,
      subject: original.subject,
      template: original.template,
      payload: {
        ...(original.payload_json || {}),
        retryOfEmailId: original.id
      },
      scheduledAt: new Date()
    });

    await auditRepo.createAuditLog(db, {
      tenantId: scope.tenantId,
      actorUserId: user.id,
      action: 'ops.retry_email',
      targetType: 'email_outbox',
      targetId: original.id,
      metadata: {
        createdEmailId: cloned.id,
        scope: scope.scope
      }
    });

    return {
      retriedFromEmailId: original.id,
      queuedEmailId: cloned.id
    };
  });
}

async function requeueRun({ user, tenant, membership, runId }) {
  const scope = resolveOpsScope({ user, tenant, membership });
  if (!runId) {
    throw badRequest('run_id_required', 'run id is required');
  }

  return withTransaction(async (db) => {
    const original = await chatRepo.getRunById(db, runId);
    if (!original) {
      throw notFound('run_not_found', 'run not found');
    }
    if (scope.tenantId && original.tenant_id !== scope.tenantId) {
      throw forbidden('ops_forbidden', 'run is outside this tenant scope');
    }
    if (!['failed', 'timed_out', 'cancelled'].includes(original.status)) {
      throw badRequest('run_requeue_invalid_status', 'only failed, timed out, or cancelled runs can be requeued');
    }

    const cloned = await chatRepo.createRun(db, {
      tenantId: original.tenant_id,
      workspaceId: original.workspace_id,
      environmentId: original.environment_id,
      projectId: original.project_id,
      sessionId: original.session_id,
      providerAccountId: original.provider_account_id,
      provider: original.provider,
      model: original.model,
      executionStats: {
        ...(original.execution_stats_json || {}),
        retryOfRunId: original.id,
        requeuedByUserId: user.id
      }
    });

    await chatRepo.createRunEvent(db, {
      runId: cloned.id,
      seq: 1,
      type: 'status',
      payload: {
        label: 'queued',
        retryOfRunId: original.id
      }
    });

    await auditRepo.createAuditLog(db, {
      tenantId: original.tenant_id,
      actorUserId: user.id,
      action: 'ops.requeue_run',
      targetType: 'run',
      targetId: original.id,
      metadata: {
        createdRunId: cloned.id,
        scope: scope.scope
      }
    });

    return {
      retriedFromRunId: original.id,
      queuedRunId: cloned.id
    };
  });
}

module.exports = {
  getQueueHealth,
  retryFailedEmail,
  requeueRun
};
