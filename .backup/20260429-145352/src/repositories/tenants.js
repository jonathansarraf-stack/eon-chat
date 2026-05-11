'use strict';

async function getPlan(db, planId) {
  const result = await db.query(
    'select id, name, is_active, seat_limit, workspace_limit, monthly_run_limit, monthly_cost_limit_cents, features_json from plans where id = $1',
    [planId]
  );
  return result.rows[0] || null;
}

async function findTenantBySlug(db, slug) {
  const result = await db.query(
    `select id, slug, name, status, plan_id, owner_user_id, created_at, updated_at
     from tenants where slug = $1 and deleted_at is null`,
    [slug]
  );
  return result.rows[0] || null;
}

async function findTenantMembership(db, tenantId, userId) {
  const result = await db.query(
    `select id, tenant_id, user_id, role, status, created_at, updated_at
     from tenant_memberships where tenant_id = $1 and user_id = $2`,
    [tenantId, userId]
  );
  return result.rows[0] || null;
}

async function createTenantBundle(db, { userId, tenantName, tenantSlug, workspaceName, planId }) {
  const tenantResult = await db.query(
    `insert into tenants (slug, name, status, plan_id, owner_user_id)
     values ($1, $2, 'trialing', $3, $4)
     returning id, slug, name, status, plan_id, owner_user_id, created_at, updated_at`,
    [tenantSlug, tenantName, planId, userId]
  );
  const tenant = tenantResult.rows[0];

  const membershipResult = await db.query(
    `insert into tenant_memberships (tenant_id, user_id, role, status)
     values ($1, $2, 'owner', 'active')
     returning id, tenant_id, user_id, role, status, created_at, updated_at`,
    [tenant.id, userId]
  );

  const workspaceSlug = 'default';
  const workspaceResult = await db.query(
    `insert into workspaces (tenant_id, name, slug, created_by)
     values ($1, $2, $3, $4)
     returning id, tenant_id, name, slug, created_at, updated_at`,
    [tenant.id, workspaceName, workspaceSlug, userId]
  );

  await db.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, 'workspace_admin')`,
    [workspaceResult.rows[0].id, userId]
  );

  await db.query(
    `insert into billing_customers (tenant_id, stripe_customer_id, status)
     values ($1, $2, 'inactive')`,
    [tenant.id, `pending_${tenant.id}`]
  );

  return {
    tenant,
    membership: membershipResult.rows[0],
    workspace: workspaceResult.rows[0]
  };
}

async function listTenantsForUser(db, userId) {
  const result = await db.query(
    `select
       t.id,
       t.slug,
       t.name,
       t.status,
       t.plan_id,
       tm.role,
       tm.status as membership_status
     from tenant_memberships tm
     join tenants t on t.id = tm.tenant_id
     where tm.user_id = $1 and tm.status in ('active','invited') and t.deleted_at is null
     order by t.created_at asc`,
    [userId]
  );
  return result.rows;
}

module.exports = {
  getPlan,
  findTenantBySlug,
  findTenantMembership,
  createTenantBundle,
  listTenantsForUser
};
