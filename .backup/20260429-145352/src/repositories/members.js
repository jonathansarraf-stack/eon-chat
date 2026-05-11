'use strict';

async function listTenantMembers(db, tenantId) {
  const result = await db.query(
    `select
       tm.id,
       tm.tenant_id,
       tm.user_id,
       tm.role,
       tm.status,
       tm.invited_by,
       tm.created_at,
       tm.updated_at,
       u.email,
       u.name
     from tenant_memberships tm
     join users u on u.id = tm.user_id
     where tm.tenant_id = $1 and tm.status <> 'removed'
     order by tm.created_at asc`,
    [tenantId]
  );
  return result.rows;
}

async function listTenantInvites(db, tenantId) {
  const result = await db.query(
    `select id, tenant_id, email, role, invited_by, expires_at, accepted_at, created_at
     from tenant_invites
     where tenant_id = $1
     order by created_at desc`,
    [tenantId]
  );
  return result.rows;
}

async function findOpenInviteByEmail(db, tenantId, email) {
  const result = await db.query(
    `select id, tenant_id, email, role, invited_by, expires_at, accepted_at, created_at
     from tenant_invites
     where tenant_id = $1
       and lower(email) = lower($2)
       and accepted_at is null
       and expires_at > now()
     order by created_at desc
     limit 1`,
    [tenantId, email]
  );
  return result.rows[0] || null;
}

async function createTenantInvite(db, { tenantId, email, role, inviteTokenHash, invitedBy, expiresAt }) {
  const result = await db.query(
    `insert into tenant_invites (tenant_id, email, role, invite_token_hash, invited_by, expires_at)
     values ($1, lower($2), $3, $4, $5, $6)
     returning id, tenant_id, email, role, invited_by, expires_at, accepted_at, created_at`,
    [tenantId, email, role, inviteTokenHash, invitedBy, expiresAt]
  );
  return result.rows[0];
}

async function findInviteByTokenHash(db, inviteTokenHash) {
  const result = await db.query(
    `select id, tenant_id, email, role, invited_by, expires_at, accepted_at, created_at
     from tenant_invites
     where invite_token_hash = $1`,
    [inviteTokenHash]
  );
  return result.rows[0] || null;
}

async function markInviteAccepted(db, inviteId) {
  await db.query(
    'update tenant_invites set accepted_at = now() where id = $1 and accepted_at is null',
    [inviteId]
  );
}

async function upsertTenantMembership(db, { tenantId, userId, role, invitedBy }) {
  const result = await db.query(
    `insert into tenant_memberships (tenant_id, user_id, role, status, invited_by)
     values ($1, $2, $3, 'active', $4)
     on conflict (tenant_id, user_id) do update set
       role = excluded.role,
       status = 'active',
       invited_by = excluded.invited_by,
       updated_at = now()
     returning id, tenant_id, user_id, role, status, invited_by, created_at, updated_at`,
    [tenantId, userId, role, invitedBy || null]
  );
  return result.rows[0];
}

async function upsertWorkspaceMembership(db, { workspaceId, userId, role }) {
  const result = await db.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, $3)
     on conflict (workspace_id, user_id) do update set
       role = excluded.role
     returning id, workspace_id, user_id, role, created_at`,
    [workspaceId, userId, role]
  );
  return result.rows[0];
}

module.exports = {
  listTenantMembers,
  listTenantInvites,
  findOpenInviteByEmail,
  createTenantInvite,
  findInviteByTokenHash,
  markInviteAccepted,
  upsertTenantMembership,
  upsertWorkspaceMembership
};
