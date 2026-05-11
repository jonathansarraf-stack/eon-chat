'use strict';

async function listEnvironments(db, { tenantId, workspaceId }) {
  const result = await db.query(
    `select
       id,
       tenant_id,
       workspace_id,
       name,
       slug,
       kind,
       status,
       host,
       port,
       agent_identifier,
       metadata_json,
       created_by,
       last_seen_at,
       archived_at,
       created_at,
       updated_at
     from environments
     where tenant_id = $1
       and workspace_id = $2
       and archived_at is null
     order by created_at asc`,
    [tenantId, workspaceId]
  );
  return result.rows;
}

async function getEnvironmentById(db, id) {
  const result = await db.query(
    `select
       id,
       tenant_id,
       workspace_id,
       name,
       slug,
       kind,
       status,
       host,
       port,
       agent_identifier,
       metadata_json,
       created_by,
       last_seen_at,
       archived_at,
       created_at,
       updated_at
     from environments
     where id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createEnvironment(db, input) {
  const result = await db.query(
    `insert into environments
       (tenant_id, workspace_id, name, slug, kind, status, host, port, agent_identifier, metadata_json, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
     returning id, tenant_id, workspace_id, name, slug, kind, status, host, port, agent_identifier,
               metadata_json, created_by, last_seen_at, archived_at, created_at, updated_at`,
    [
      input.tenantId,
      input.workspaceId,
      input.name,
      input.slug,
      input.kind,
      input.status || 'active',
      input.host || null,
      input.port || null,
      input.agentIdentifier || null,
      JSON.stringify(input.metadata || {}),
      input.createdBy || null
    ]
  );
  return result.rows[0];
}

async function updateEnvironment(db, input) {
  const result = await db.query(
    `update environments
        set name = $2,
            status = $3,
            host = $4,
            port = $5,
            agent_identifier = $6,
            metadata_json = $7::jsonb,
            archived_at = $8,
            updated_at = now()
      where id = $1
      returning id, tenant_id, workspace_id, name, slug, kind, status, host, port, agent_identifier,
                metadata_json, created_by, last_seen_at, archived_at, created_at, updated_at`,
    [
      input.id,
      input.name,
      input.status,
      input.host || null,
      input.port || null,
      input.agentIdentifier || null,
      JSON.stringify(input.metadata || {}),
      input.archivedAt || null
    ]
  );
  return result.rows[0] || null;
}

async function createDiscoveryRequest(db, input) {
  const result = await db.query(
    `insert into project_discovery_requests
       (tenant_id, workspace_id, environment_id, requested_by, strategy, status, request_json)
     values ($1, $2, $3, $4, $5, 'queued', $6::jsonb)
     returning id, tenant_id, workspace_id, environment_id, requested_by, strategy, status,
               request_json, result_json, error_text, created_at, updated_at, finished_at`,
    [
      input.tenantId,
      input.workspaceId,
      input.environmentId,
      input.requestedBy,
      input.strategy,
      JSON.stringify(input.request || {})
    ]
  );
  return result.rows[0];
}

async function listDiscoveryRequestsForEnvironment(db, environmentId) {
  const result = await db.query(
    `select
       id,
       tenant_id,
       workspace_id,
       environment_id,
       requested_by,
       strategy,
       status,
       request_json,
       result_json,
       error_text,
       created_at,
       updated_at,
       finished_at
     from project_discovery_requests
     where environment_id = $1
     order by created_at desc`,
    [environmentId]
  );
  return result.rows;
}

module.exports = {
  listEnvironments,
  getEnvironmentById,
  createEnvironment,
  updateEnvironment,
  createDiscoveryRequest,
  listDiscoveryRequestsForEnvironment
};
