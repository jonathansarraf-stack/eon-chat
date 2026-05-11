'use strict';

async function listProviderAccounts(db, tenantId, workspaceId) {
  const params = [tenantId];
  let sql = `
    select id, tenant_id, workspace_id, provider, mode, display_name, status,
           encrypted_secret_ref, secret_last_rotated_at, config_json, created_by, created_at, updated_at
    from provider_accounts
    where tenant_id = $1
  `;

  if (workspaceId) {
    sql += ' and (workspace_id = $2 or workspace_id is null)';
    params.push(workspaceId);
  }

  sql += ' order by created_at asc';
  const result = await db.query(sql, params);
  return result.rows;
}

async function createProviderAccount(db, input) {
  const result = await db.query(
    `insert into provider_accounts
       (tenant_id, workspace_id, provider, mode, display_name, status, encrypted_secret_ref, secret_last_rotated_at, config_json, created_by)
     values ($1, $2, $3, $4, $5, 'active', $6, now(), $7::jsonb, $8)
     returning id, tenant_id, workspace_id, provider, mode, display_name, status,
               encrypted_secret_ref, secret_last_rotated_at, config_json, created_by, created_at, updated_at`,
    [
      input.tenantId,
      input.workspaceId || null,
      input.provider,
      input.mode,
      input.displayName,
      input.encryptedSecretRef,
      JSON.stringify(input.config || {}),
      input.createdBy
    ]
  );
  return result.rows[0];
}

async function getProviderAccountById(db, id) {
  const result = await db.query(
    `select id, tenant_id, workspace_id, provider, mode, display_name, status,
            encrypted_secret_ref, secret_last_rotated_at, config_json, created_by, created_at, updated_at
     from provider_accounts where id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  listProviderAccounts,
  createProviderAccount,
  getProviderAccountById
};
