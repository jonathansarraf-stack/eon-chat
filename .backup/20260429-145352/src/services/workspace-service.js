'use strict';

const { getPool } = require('../db');
const { badRequest, forbidden } = require('../errors');
const workspacesRepo = require('../repositories/workspaces');

async function listWorkspaces({ tenant, membership, user }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  if (!membership || membership.status !== 'active') {
    throw forbidden('workspace_forbidden', 'active tenant membership required');
  }
  return workspacesRepo.listWorkspacesForTenantUser(getPool(), tenant.id, user.id);
}

module.exports = {
  listWorkspaces
};
