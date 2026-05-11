'use strict';

async function listWorkspacesForTenantUser(db, tenantId, userId) {
  const result = await db.query(
    `select
       w.id,
       w.tenant_id,
       w.name,
       w.slug,
       w.runtime_profile_id,
       w.created_by,
       w.archived_at,
       w.created_at,
       w.updated_at,
       wm.role as workspace_role
     from workspaces w
     join workspace_memberships wm on wm.workspace_id = w.id
     where w.tenant_id = $1 and wm.user_id = $2 and w.archived_at is null
     order by w.created_at asc`,
    [tenantId, userId]
  );
  return result.rows;
}

async function getWorkspaceForTenantUser(db, tenantId, workspaceId, userId) {
  const result = await db.query(
    `select
       w.id,
       w.tenant_id,
       w.name,
       w.slug,
       w.runtime_profile_id,
       w.created_by,
       w.archived_at,
       w.created_at,
       w.updated_at,
       wm.role as workspace_role
     from workspaces w
     join workspace_memberships wm on wm.workspace_id = w.id
     where w.tenant_id = $1
       and w.id = $2
       and wm.user_id = $3
       and w.archived_at is null`,
    [tenantId, workspaceId, userId]
  );
  return result.rows[0] || null;
}

async function listActiveWorkspacesForTenant(db, tenantId) {
  const result = await db.query(
    `select
       id,
       tenant_id,
       name,
       slug,
       runtime_profile_id,
       created_by,
       archived_at,
       created_at,
       updated_at
     from workspaces
     where tenant_id = $1 and archived_at is null
     order by created_at asc`,
    [tenantId]
  );
  return result.rows;
}

module.exports = {
  listWorkspacesForTenantUser,
  getWorkspaceForTenantUser,
  listActiveWorkspacesForTenant
};
