'use strict';

const config = require('../config');
const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden } = require('../errors');
const tenantsRepo = require('../repositories/tenants');

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

async function bootstrapTenant({ userId, tenantName, tenantSlug, workspaceName, planId }) {
  if (!userId) throw forbidden('auth_required', 'authentication required');
  if (!tenantName) throw badRequest('tenant_name_required', 'tenant name is required');

  const normalizedSlug = normalizeSlug(tenantSlug || tenantName);
  if (!normalizedSlug || normalizedSlug.length < 3) {
    throw badRequest('invalid_tenant_slug', 'tenant slug must be at least 3 characters');
  }

  const selectedPlanId = planId || config.defaultPlanId;
  const pool = getPool();
  const plan = await tenantsRepo.getPlan(pool, selectedPlanId);
  if (!plan || !plan.is_active) {
    throw badRequest('invalid_plan', 'selected plan is not available');
  }

  const existingTenant = await tenantsRepo.findTenantBySlug(pool, normalizedSlug);
  if (existingTenant) {
    throw badRequest('tenant_slug_in_use', 'tenant slug already in use');
  }

  return withTransaction((db) => tenantsRepo.createTenantBundle(db, {
    userId,
    tenantName,
    tenantSlug: normalizedSlug,
    workspaceName: workspaceName || config.defaultWorkspaceName,
    planId: selectedPlanId
  }));
}

async function listUserTenants(userId) {
  if (!userId) return [];
  return tenantsRepo.listTenantsForUser(getPool(), userId);
}

module.exports = {
  bootstrapTenant,
  listUserTenants,
  normalizeSlug
};
