'use strict';

async function listProjects(db, { tenantId, workspaceId, environmentId }) {
  const params = [tenantId, workspaceId];
  let sql = `
    select
      id,
      tenant_id,
      workspace_id,
      environment_id,
      name,
      slug,
      root_path,
      source,
      status,
      metadata_json,
      created_by,
      last_synced_at,
      archived_at,
      created_at,
      updated_at
    from projects
    where tenant_id = $1
      and workspace_id = $2
      and archived_at is null
  `;

  if (environmentId) {
    params.push(environmentId);
    sql += ` and environment_id = $${params.length}`;
  }

  sql += ' order by created_at asc';
  const result = await db.query(sql, params);
  return result.rows;
}

async function getProjectById(db, id) {
  const result = await db.query(
    `select
       id,
       tenant_id,
       workspace_id,
       environment_id,
       name,
       slug,
       root_path,
       source,
       status,
       metadata_json,
       created_by,
       last_synced_at,
       archived_at,
       created_at,
       updated_at
     from projects
     where id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createProject(db, input) {
  const result = await db.query(
    `insert into projects
       (tenant_id, workspace_id, environment_id, name, slug, root_path, source, status, metadata_json, created_by, last_synced_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     returning id, tenant_id, workspace_id, environment_id, name, slug, root_path, source, status,
               metadata_json, created_by, last_synced_at, archived_at, created_at, updated_at`,
    [
      input.tenantId,
      input.workspaceId,
      input.environmentId,
      input.name,
      input.slug,
      input.rootPath,
      input.source || 'manual',
      input.status || 'active',
      JSON.stringify(input.metadata || {}),
      input.createdBy || null,
      input.lastSyncedAt || null
    ]
  );
  return result.rows[0];
}

async function updateProject(db, input) {
  const result = await db.query(
    `update projects
        set name = $2,
            root_path = $3,
            source = $4,
            status = $5,
            metadata_json = $6::jsonb,
            last_synced_at = $7,
            archived_at = $8,
            updated_at = now()
      where id = $1
      returning id, tenant_id, workspace_id, environment_id, name, slug, root_path, source, status,
                metadata_json, created_by, last_synced_at, archived_at, created_at, updated_at`,
    [
      input.id,
      input.name,
      input.rootPath,
      input.source,
      input.status,
      JSON.stringify(input.metadata || {}),
      input.lastSyncedAt || null,
      input.archivedAt || null
    ]
  );
  return result.rows[0] || null;
}

module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject
};
