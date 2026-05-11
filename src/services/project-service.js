'use strict';

const { getPool } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const workspacesRepo = require('../repositories/workspaces');
const environmentsRepo = require('../repositories/environments');
const projectsRepo = require('../repositories/projects');
const { normalizeSlug } = require('./tenant-service');

const EDITOR_ROLES = new Set(['owner', 'admin', 'developer', 'billing_admin']);
const PROJECT_SOURCES = new Set(['manual', 'discovered', 'imported', 'synced']);
const PROJECT_STATUSES = new Set(['active', 'archived', 'importing', 'error']);

function assertTenantContext(tenant, membership, user) {
  if (!tenant) throw badRequest('tenant_required', 'tenant context required');
  if (!membership || membership.status !== 'active') {
    throw forbidden('workspace_forbidden', 'active tenant membership required');
  }
  if (!user) throw forbidden('auth_required', 'authentication required');
}

function assertEditorRole(membership) {
  if (!EDITOR_ROLES.has(membership.role)) {
    throw forbidden('project_forbidden', 'editor or admin role required');
  }
}

async function assertWorkspaceAccess(tenantId, workspaceId, userId) {
  if (!workspaceId) throw badRequest('workspace_required', 'workspaceId is required');
  const workspace = await workspacesRepo.getWorkspaceForTenantUser(getPool(), tenantId, workspaceId, userId);
  if (!workspace) {
    throw forbidden('workspace_forbidden', 'workspace does not belong to the current user scope');
  }
  return workspace;
}

function normalizeSource(source, fallback = 'manual') {
  const normalized = String(source || fallback).trim().toLowerCase();
  if (!PROJECT_SOURCES.has(normalized)) {
    throw badRequest('invalid_project_source', 'project source is not supported');
  }
  return normalized;
}

function normalizeStatus(status, fallback = 'active') {
  const normalized = String(status || fallback).trim().toLowerCase();
  if (!PROJECT_STATUSES.has(normalized)) {
    throw badRequest('invalid_project_status', 'project status is not supported');
  }
  return normalized;
}

async function listProjects({ tenant, membership, user, workspaceId, environmentId }) {
  assertTenantContext(tenant, membership, user);
  await assertWorkspaceAccess(tenant.id, workspaceId, user.id);

  if (environmentId) {
    const environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
    if (!environment || environment.tenant_id !== tenant.id || environment.workspace_id !== workspaceId) {
      throw notFound('environment_not_found', 'environment not found for this workspace');
    }
  }

  return projectsRepo.listProjects(getPool(), {
    tenantId: tenant.id,
    workspaceId,
    environmentId: environmentId || null
  });
}

async function createProject({ tenant, membership, user, workspaceId, environmentId, name, slug, rootPath, source, metadata }) {
  assertTenantContext(tenant, membership, user);
  assertEditorRole(membership);
  await assertWorkspaceAccess(tenant.id, workspaceId, user.id);

  if (!environmentId) throw badRequest('environment_required', 'environmentId is required');
  const environment = await environmentsRepo.getEnvironmentById(getPool(), environmentId);
  if (!environment || environment.tenant_id !== tenant.id || environment.workspace_id !== workspaceId) {
    throw notFound('environment_not_found', 'environment not found for this workspace');
  }
  if (!name) throw badRequest('project_name_required', 'project name is required');
  if (!rootPath) throw badRequest('project_root_path_required', 'project rootPath is required');

  const normalizedSlug = normalizeSlug(slug || name);
  if (!normalizedSlug || normalizedSlug.length < 2) {
    throw badRequest('invalid_project_slug', 'project slug must be at least 2 characters');
  }

  return projectsRepo.createProject(getPool(), {
    tenantId: tenant.id,
    workspaceId,
    environmentId,
    name: String(name).trim(),
    slug: normalizedSlug,
    rootPath: String(rootPath).trim(),
    source: normalizeSource(source),
    status: normalizeStatus('active'),
    metadata: metadata || {},
    createdBy: user.id,
    lastSyncedAt: null
  });
}

async function updateProject({ tenant, membership, user, projectId, input }) {
  assertTenantContext(tenant, membership, user);
  assertEditorRole(membership);
  const project = await projectsRepo.getProjectById(getPool(), projectId);
  if (!project || project.tenant_id !== tenant.id) {
    throw notFound('project_not_found', 'project not found');
  }
  await assertWorkspaceAccess(tenant.id, project.workspace_id, user.id);

  return projectsRepo.updateProject(getPool(), {
    id: project.id,
    name: input?.name ? String(input.name).trim() : project.name,
    rootPath: input?.rootPath ? String(input.rootPath).trim() : project.root_path,
    source: normalizeSource(input?.source, project.source),
    status: normalizeStatus(input?.status, project.status),
    metadata: input?.metadata !== undefined ? (input.metadata || {}) : (project.metadata_json || {}),
    lastSyncedAt: input?.lastSyncedAt || project.last_synced_at || null,
    archivedAt: input?.archived ? new Date().toISOString() : null
  });
}

module.exports = {
  listProjects,
  createProject,
  updateProject
};
