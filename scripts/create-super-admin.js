'use strict';

const { Client } = require('pg');
const { hashPassword } = require('../src/crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

async function ensureUser(client, { email, name, passwordHash }) {
  const existing = await client.query(
    `select id, email, name, global_role, email_verified_at
     from users
     where lower(email) = lower($1)`,
    [email]
  );

  if (existing.rows[0]) {
    const updated = await client.query(
      `update users
       set name = $2,
           password_hash = $3,
           global_role = 'platform_admin',
           email_verified_at = coalesce(email_verified_at, now())
       where id = $1
       returning id, email, name, global_role, email_verified_at`,
      [existing.rows[0].id, name, passwordHash]
    );
    return { user: updated.rows[0], created: false };
  }

  const created = await client.query(
    `insert into users (email, name, password_hash, global_role, email_verified_at)
     values (lower($1), $2, $3, 'platform_admin', now())
     returning id, email, name, global_role, email_verified_at`,
    [email, name, passwordHash]
  );
  return { user: created.rows[0], created: true };
}

async function ensureTenantBundle(client, { userId, tenantName, tenantSlug, planId }) {
  const existingTenant = await client.query(
    `select id, slug, name, plan_id, status
     from tenants
     where slug = $1 and deleted_at is null`,
    [tenantSlug]
  );

  let tenant = existingTenant.rows[0] || null;
  if (!tenant) {
    const inserted = await client.query(
      `insert into tenants (slug, name, status, plan_id, owner_user_id)
       values ($1, $2, 'active', $3, $4)
       returning id, slug, name, status, plan_id`,
      [tenantSlug, tenantName, planId, userId]
    );
    tenant = inserted.rows[0];
  } else {
    const updated = await client.query(
      `update tenants
       set name = $2,
           status = 'active',
           plan_id = $3,
           owner_user_id = $4,
           updated_at = now()
       where id = $1
       returning id, slug, name, status, plan_id`,
      [tenant.id, tenantName, planId, userId]
    );
    tenant = updated.rows[0];
  }

  await client.query(
    `insert into tenant_memberships (tenant_id, user_id, role, status)
     values ($1, $2, 'owner', 'active')
     on conflict (tenant_id, user_id) do update set
       role = 'owner',
       status = 'active',
       updated_at = now()`,
    [tenant.id, userId]
  );

  const workspace = await client.query(
    `insert into workspaces (tenant_id, name, slug, created_by)
     values ($1, 'Admin Workspace', 'admin-workspace', $2)
     on conflict (tenant_id, slug) do update set
       name = excluded.name,
       updated_at = now()
     returning id, tenant_id, name, slug`,
    [tenant.id, userId]
  );

  await client.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, 'workspace_admin')
     on conflict (workspace_id, user_id) do update set
       role = 'workspace_admin'`,
    [workspace.rows[0].id, userId]
  );

  await client.query(
    `insert into billing_customers (tenant_id, stripe_customer_id, status)
     values ($1, $2, 'active')
     on conflict (tenant_id) do update set
       stripe_customer_id = excluded.stripe_customer_id,
       status = 'active',
       updated_at = now()`,
    [tenant.id, `internal_superadmin_${tenant.id}`]
  );

  return {
    tenant,
    workspace: workspace.rows[0]
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const email = String(args.email || process.env.SUPERADMIN_EMAIL || 'superadmin@eonchat.local').toLowerCase();
  const password = String(args.password || process.env.SUPERADMIN_PASSWORD || 'EonTest!2026');
  const name = String(args.name || process.env.SUPERADMIN_NAME || 'Eon Super Admin');
  const tenantName = String(args.tenantName || process.env.SUPERADMIN_TENANT_NAME || 'Eon Internal Admin');
  const tenantSlug = slugify(args.tenantSlug || process.env.SUPERADMIN_TENANT_SLUG || 'eon-internal-admin');
  const planId = String(args.planId || process.env.SUPERADMIN_PLAN_ID || 'enterprise');
  const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/eon_chat';

  const passwordHash = await hashPassword(password);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('begin');
    const { user, created: userCreated } = await ensureUser(client, { email, name, passwordHash });
    const { tenant, workspace } = await ensureTenantBundle(client, {
      userId: user.id,
      tenantName,
      tenantSlug,
      planId
    });
    await client.query('commit');

    console.log(JSON.stringify({
      ok: true,
      userCreated,
      email: user.email,
      password,
      globalRole: user.global_role,
      emailVerifiedAt: user.email_verified_at,
      tenant,
      workspace
    }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[create-super-admin] failed:', error.message);
  process.exit(1);
});
