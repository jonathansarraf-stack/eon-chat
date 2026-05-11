'use strict';

const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden } = require('../errors');
const { encryptSecret, maskSecret } = require('../secrets');
const providerAccountsRepo = require('../repositories/provider-accounts');
const { getProviderAdapter } = require('../providers');

function assertTenantAdmin(membership) {
  if (!membership || !['owner', 'admin', 'billing_admin'].includes(membership.role)) {
    throw forbidden('provider_account_forbidden', 'tenant admin role required');
  }
}

function assertActiveMembership(membership) {
  if (!membership || membership.status !== 'active') {
    throw forbidden('provider_account_forbidden', 'active tenant membership required');
  }
}

function sanitizeProviderAccount(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    mode: row.mode,
    displayName: row.display_name,
    status: row.status,
    secretLastRotatedAt: row.secret_last_rotated_at,
    secretPreview: row.config_json?.secretPreview || (row.encrypted_secret_ref ? maskSecret('secret-not-available') : null),
    config: row.config_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function adapterShape(row) {
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    encryptedSecretRef: row.encrypted_secret_ref,
    config: row.config_json || {}
  };
}

async function listProviderAccounts({ tenant, membership, workspaceId }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  assertActiveMembership(membership);
  const rows = await providerAccountsRepo.listProviderAccounts(getPool(), tenant.id, workspaceId);
  return rows.map(sanitizeProviderAccount);
}

async function createProviderAccount({ tenant, membership, user, provider, mode, displayName, secret, config, workspaceId }) {
  assertTenantAdmin(membership);
  if (!provider || !['claude_code', 'codex'].includes(provider)) {
    throw badRequest('invalid_provider', 'provider must be claude_code or codex');
  }
  if (!mode || !['platform_managed', 'byok'].includes(mode)) {
    throw badRequest('invalid_mode', 'mode must be platform_managed or byok');
  }
  if (!displayName) {
    throw badRequest('display_name_required', 'displayName is required');
  }
  if (mode === 'byok' && !secret) {
    throw badRequest('secret_required', 'secret is required');
  }

  const adapter = getProviderAdapter(provider);
  if (!adapter) {
    throw badRequest('provider_not_supported', 'provider is not supported');
  }

  const encryptedSecretRef = secret ? encryptSecret(secret) : null;
  const storedConfig = {
    ...(config || {}),
    ...(secret ? { secretPreview: maskSecret(secret) } : {})
  };
  const created = await withTransaction((db) => providerAccountsRepo.createProviderAccount(db, {
    tenantId: tenant.id,
    workspaceId,
    provider,
    mode,
    displayName,
    encryptedSecretRef,
    config: storedConfig,
    createdBy: user.id
  }));

  const validation = await adapter.validateCredentials(adapterShape(created));
  if (!validation.ok) {
    throw badRequest('invalid_credentials', 'credential validation failed');
  }

  return sanitizeProviderAccount(created);
}

async function listSupportedProviders() {
  return [
    {
      id: 'claude_code',
      name: 'Claude Code',
      models: await getProviderAdapter('claude_code').listModels()
    },
    {
      id: 'codex',
      name: 'Codex',
      models: await getProviderAdapter('codex').listModels()
    }
  ];
}

module.exports = {
  listProviderAccounts,
  createProviderAccount,
  listSupportedProviders
};
