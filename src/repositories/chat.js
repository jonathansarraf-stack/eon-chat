'use strict';

async function listChatSessions(db, tenantId, workspaceId, userId, filters = {}) {
  const params = [tenantId, workspaceId, userId];
  let sql = `
    select
      cs.id,
      cs.tenant_id,
      cs.workspace_id,
      cs.environment_id,
      cs.project_id,
      cs.user_id,
      cs.provider_account_id,
      cs.title,
      cs.status,
      cs.metadata_json,
      cs.created_at,
      cs.updated_at
    from chat_sessions cs
    where cs.tenant_id = $1 and cs.workspace_id = $2 and cs.user_id = $3
  `;

  if (filters.environmentId) {
    params.push(filters.environmentId);
    sql += ` and cs.environment_id = $${params.length}`;
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    sql += ` and cs.project_id = $${params.length}`;
  }

  sql += ' order by cs.updated_at desc';
  const result = await db.query(sql, params);
  return result.rows;
}

async function createChatSession(db, { tenantId, workspaceId, environmentId, projectId, userId, providerAccountId, title, metadata }) {
  const result = await db.query(
    `insert into chat_sessions (tenant_id, workspace_id, environment_id, project_id, user_id, provider_account_id, title, metadata_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id, tenant_id, workspace_id, environment_id, project_id, user_id, provider_account_id, title, status, metadata_json, created_at, updated_at`,
    [tenantId, workspaceId, environmentId || null, projectId || null, userId, providerAccountId || null, title || 'New chat', JSON.stringify(metadata || {})]
  );
  return result.rows[0];
}

async function getChatSession(db, sessionId) {
  const result = await db.query(
    `select id, tenant_id, workspace_id, environment_id, project_id, user_id, provider_account_id, title, status, metadata_json, created_at, updated_at
     from chat_sessions where id = $1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

async function listMessages(db, sessionId) {
  const result = await db.query(
    `select id, session_id, role, content_json, error_code, created_at
     from chat_messages where session_id = $1
     order by created_at asc`,
    [sessionId]
  );
  return result.rows;
}

async function createMessage(db, { sessionId, role, content, errorCode }) {
  const result = await db.query(
    `insert into chat_messages (session_id, role, content_json, error_code)
     values ($1, $2, $3::jsonb, $4)
     returning id, session_id, role, content_json, error_code, created_at`,
    [sessionId, role, JSON.stringify(content || {}), errorCode || null]
  );
  return result.rows[0];
}

async function touchChatSession(db, sessionId) {
  await db.query('update chat_sessions set updated_at = now() where id = $1', [sessionId]);
}

async function listRuns(db, sessionId) {
  const result = await db.query(
    `select id, tenant_id, workspace_id, environment_id, project_id, session_id, provider_account_id, provider, model, status,
            sandbox_id, started_at, finished_at, cost_usd, token_usage_json, execution_stats_json, created_at, updated_at
     from runs where session_id = $1
     order by created_at desc`,
    [sessionId]
  );
  return result.rows;
}

async function listRunEvents(db, runId) {
  const result = await db.query(
    `select id, run_id, seq, type, payload_json, created_at
     from run_events
     where run_id = $1
     order by seq asc`,
    [runId]
  );
  return result.rows;
}

async function createRun(db, { tenantId, workspaceId, environmentId, projectId, sessionId, providerAccountId, provider, model, executionStats }) {
  const result = await db.query(
    `insert into runs (tenant_id, workspace_id, environment_id, project_id, session_id, provider_account_id, provider, model, status, execution_stats_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9::jsonb)
     returning id, tenant_id, workspace_id, environment_id, project_id, session_id, provider_account_id, provider, model, status,
               sandbox_id, started_at, finished_at, cost_usd, token_usage_json, execution_stats_json, created_at, updated_at`,
    [tenantId, workspaceId, environmentId || null, projectId || null, sessionId, providerAccountId || null, provider, model, JSON.stringify(executionStats || {})]
  );
  return result.rows[0];
}

async function createRunEvent(db, { runId, seq, type, payload }) {
  const result = await db.query(
    `insert into run_events (run_id, seq, type, payload_json)
     values ($1, $2, $3, $4::jsonb)
     returning id, run_id, seq, type, payload_json, created_at`,
    [runId, seq, type, JSON.stringify(payload || {})]
  );
  return result.rows[0];
}

async function claimNextQueuedRun(db) {
  const result = await db.query(
    `with next_run as (
       select id
       from runs
       where status = 'queued'
       order by created_at asc
       limit 1
       for update skip locked
     )
     update runs r
        set status = 'running',
            started_at = now(),
            updated_at = now()
       from next_run
      where r.id = next_run.id
      returning r.id, r.tenant_id, r.workspace_id, r.environment_id, r.project_id, r.session_id, r.provider_account_id, r.provider, r.model,
                r.status, r.sandbox_id, r.started_at, r.finished_at, r.cost_usd, r.token_usage_json,
                r.execution_stats_json, r.created_at, r.updated_at`,
    []
  );
  return result.rows[0] || null;
}

async function getRunWithSession(db, runId) {
  const result = await db.query(
    `select
       r.id,
       r.tenant_id,
       r.workspace_id,
       r.environment_id,
       r.project_id,
       r.session_id,
       r.provider_account_id,
       r.provider,
       r.model,
       r.status,
       r.sandbox_id,
       r.started_at,
       r.finished_at,
       r.cost_usd,
       r.token_usage_json,
       r.execution_stats_json,
       r.created_at,
       r.updated_at,
       cs.user_id,
       cs.title,
       cs.environment_id as session_environment_id,
       cs.project_id as session_project_id,
       cs.metadata_json
     from runs r
     join chat_sessions cs on cs.id = r.session_id
     where r.id = $1`,
    [runId]
  );
  return result.rows[0] || null;
}

async function getRunById(db, runId) {
  const result = await db.query(
    `select id, tenant_id, workspace_id, environment_id, project_id, session_id, provider_account_id, provider, model, status,
            sandbox_id, started_at, finished_at, cost_usd, token_usage_json, execution_stats_json, created_at, updated_at
     from runs
     where id = $1`,
    [runId]
  );
  return result.rows[0] || null;
}

async function nextRunEventSeq(db, runId) {
  const result = await db.query(
    'select coalesce(max(seq), 0) + 1 as next_seq from run_events where run_id = $1',
    [runId]
  );
  return Number(result.rows[0].next_seq);
}

async function markRunCompleted(db, { runId, costUsd, tokenUsage, executionStats }) {
  const result = await db.query(
    `update runs
        set status = 'completed',
            finished_at = now(),
            updated_at = now(),
            cost_usd = coalesce($2, cost_usd),
            token_usage_json = coalesce($3::jsonb, token_usage_json),
            execution_stats_json = coalesce($4::jsonb, execution_stats_json)
      where id = $1
      returning id, status, finished_at, cost_usd, token_usage_json, execution_stats_json`,
    [
      runId,
      costUsd ?? null,
      tokenUsage ? JSON.stringify(tokenUsage) : null,
      executionStats ? JSON.stringify(executionStats) : null
    ]
  );
  return result.rows[0] || null;
}

async function markRunFailed(db, { runId, errorMessage, executionStats }) {
  const mergedStats = {
    ...(executionStats || {}),
    ...(errorMessage ? { errorMessage } : {})
  };
  const result = await db.query(
    `update runs
        set status = 'failed',
            finished_at = now(),
            updated_at = now(),
            execution_stats_json = coalesce($2::jsonb, execution_stats_json)
      where id = $1
      returning id, status, finished_at, execution_stats_json`,
    [
      runId,
      Object.keys(mergedStats).length ? JSON.stringify(mergedStats) : null
    ]
  );
  return result.rows[0] || null;
}

async function summarizeRunsQueue(db, { tenantId } = {}) {
  const params = [];
  const where = [];
  if (tenantId) {
    params.push(tenantId);
    where.push(`tenant_id = $${params.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const result = await db.query(
    `select
       count(*)::int as total,
       count(*) filter (where status = 'queued')::int as queued,
       count(*) filter (where status = 'running')::int as running,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'failed')::int as failed,
       min(created_at) filter (where status = 'queued') as oldest_queued_at,
       min(started_at) filter (where status = 'running') as oldest_running_at
     from runs
     ${whereSql}`,
    params
  );
  return result.rows[0];
}

async function listRecentProblemRuns(db, { tenantId, limit = 5 } = {}) {
  const params = [];
  const where = [`status in ('failed','timed_out','cancelled')`];
  if (tenantId) {
    params.push(tenantId);
    where.push(`tenant_id = $${params.length}`);
  }
  params.push(limit);

  const result = await db.query(
    `select id, tenant_id, workspace_id, environment_id, project_id, session_id, provider, model, status, execution_stats_json, updated_at
     from runs
     where ${where.join(' and ')}
     order by updated_at desc
     limit $${params.length}`,
    params
  );
  return result.rows;
}

module.exports = {
  listChatSessions,
  createChatSession,
  getChatSession,
  listMessages,
  createMessage,
  touchChatSession,
  listRuns,
  listRunEvents,
  createRun,
  createRunEvent,
  claimNextQueuedRun,
  getRunById,
  getRunWithSession,
  nextRunEventSeq,
  markRunCompleted,
  markRunFailed,
  summarizeRunsQueue,
  listRecentProblemRuns
};
