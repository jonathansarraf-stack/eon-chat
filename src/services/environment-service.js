'use strict';

const { getPool } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const workspacesRepo = require('../repositories/workspaces');
const environmentsRepo = require('../repositories/environments');
const { normalizeSlug } = require('./tenant-service');

const EDITOR_ROLES = new Set(['owner', 'admin', 'developer', 'billing_admin']);
const ENVIRONMENT_KINDS = new Set(['ssh', 'agent', 'local_agent', 'docker_host']);
const ENVIRONMENT_STATUSES = new Set(['draft', 'active', 'degraded', 'disabled', 'archived']);
const DISCOVERY_STRATEGIES = new Set(['agent_inventory', 'ssh_scan', 'manual']);

function assertTenantContext(tenant, membership, user) {
  if (!tenant) throw badRequest('tenant_required', 'tenant context required');
  if (!membership || membership.status !== 'active') {
    throw forbidden('workspace_forbidden', 'active tenant membership required');
  }
  if (!user) throw forbidden('auth_required', 'authentication required');
}

async function assertWorkspaceAccess(tenantId, workspaceId, userId) {
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');
  const workspace = await workspacesRepo.getWorkspaceForTenantUser(getPool(), tenantId, workspaceId, userId);
  if (!workspace) {
    throw forbidden('workspace_forbidden', 'workspace does not belong to the current user scope');
  }
  return workspace;
}

function assertEditorRole(membership) {
  if (!EDITOR_ROLES.has(membership.role)) {
    throw forbidden('environment_forbidden', 'editor or admin role required');
  }
}

function normalizeKind(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  if (!ENVIRONMENT_KINDS.has(normalized)) {
    throw badRequest('invalid_environment_kind', 'environment kind is not supported');
  }
  return normalized;
}

function normalizeStatus(status, fallback = 'active') {
  const normalized = String(status || fallback).trim().toLowerCase();
  if (!ENVIRONMENT_STATUSES.has(normalized)) {
    throw badRequest('invalid_environment_status', 'environment status is not supported');
  }
  return normalized;
}

function normalizePort(port) {
  if (port === undefined || port === null || port === '') return null;
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw badRequest('invalid_environment_port', 'environment port must be a valid TCP port');
  }
  return parsed;
}

async function listEnvironments({ tenant, membership, user, workspaceId }) {
  assertTenantContext(tenant, membership, user);
  await assertWorkspaceAccess(tenant.id, workspaceId, user.id);
  return environmentsRepo.listEnvironments(getPool(), {
    tenantId: tenant.id,
    workspaceId
  });
}

async function createEnvironment({ tenant, membership, user, workspaceId, name, slug, kind, host, port, agentIdentifier, metadata }) {
  assertTenantContext(tenant, membership, user);
  assertEditorRole(membership);
  await assertWorkspaceAccess(tenant.id, workspaceId, user.id);

  if (!name) throw badRequest('environment_name_required', 'environment name is required');
  const normalizedSlug = normalizeSlug(slug || name);
  if (!normalizedSlug || normalizedSlug.length < 2) {
    throw badRequest('invalid_environment_slug', 'environment slug must be at least 2 characters');
  }

  return environmentsRepo.createEnvironment(getPool(), {
    tenantId: tenant.id,
    workspaceId,
    name: String(name).trim(),
    slug: normalizedSlug,
    kind: normalizeKind(kind),
    status: normalizeStatus('active'),
    host: host ? String(host).trim() : null,
    port: normalizePort(port),
    agentIdentifier: agentIdentifier ? String(agentIdentifier).trim() : null,
    metadata: metadata || {},
    createdBy: user.id
  });
}

async function updateEnvironment({ tenant, membership, user, environmentId, input }) {
  assertTenantContext(tenant, membership, user);
  assertEditorRole(membership);
  const environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
  if (!environment || environment.tenant_id !== tenant.id) {
    throw notFound('environment_not_found', 'environment not found');
  }
  await assertWorkspaceAccess(tenant.id, environment.workspace_id, user.id);

  return environmentsRepo.updateEnvironment(getPool(), {
    id: environment.id,
    name: input?.name ? String(input.name).trim() : environment.name,
    status: normalizeStatus(input?.status, environment.status),
    host: input?.host !== undefined ? (input.host ? String(input.host).trim() : null) : environment.host,
    port: input?.port !== undefined ? normalizePort(input.port) : environment.port,
    agentIdentifier: input?.agentIdentifier !== undefined
      ? (input.agentIdentifier ? String(input.agentIdentifier).trim() : null)
      : environment.agent_identifier,
    metadata: input?.metadata !== undefined ? (input.metadata || {}) : (environment.metadata_json || {}),
    archivedAt: input?.archived ? new Date().toISOString() : null
  });
}

async function queueProjectDiscovery({ tenant, membership, user, environmentId, strategy, request }) {
  assertTenantContext(tenant, membership, user);
  assertEditorRole(membership);
  const environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
  if (!environment || environment.tenant_id !== tenant.id) {
    throw notFound('environment_not_found', 'environment not found');
  }
  await assertWorkspaceAccess(tenant.id, environment.workspace_id, user.id);

  const normalizedStrategy = String(strategy || 'agent_inventory').trim().toLowerCase();
  if (!DISCOVERY_STRATEGIES.has(normalizedStrategy)) {
    throw badRequest('invalid_discovery_strategy', 'discovery strategy is not supported');
  }

  const discoveryRequest = await environmentsRepo.createDiscoveryRequest(getPool(), {
    tenantId: tenant.id,
    workspaceId: environment.workspace_id,
    environmentId: environment.id,
    requestedBy: user.id,
    strategy: normalizedStrategy,
    request: request || {}
  });

  return {
    environment,
    discoveryRequest
  };
}

async function listDiscoveryRequests({ tenant, membership, user, environmentId }) {
  assertTenantContext(tenant, membership, user);
  const environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
  if (!environment || environment.tenant_id !== tenant.id) {
    throw notFound('environment_not_found', 'environment not found');
  }
  await assertWorkspaceAccess(tenant.id, environment.workspace_id, user.id);

  return environmentsRepo.listDiscoveryRequestsForEnvironment(getPool(), environment.id);
}

module.exports = {
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  queueProjectDiscovery,
  listDiscoveryRequests
};
