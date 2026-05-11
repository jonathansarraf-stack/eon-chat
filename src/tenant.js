'use strict';

const config = require('./config');
const { getPool } = require('./db');
const tenantsRepo = require('./repositories/tenants');

function extractSlugFromHost(hostHeader) {
  if (!hostHeader) return '';
  const host = String(hostHeader).split(':')[0].trim().toLowerCase();
  if (host === 'localhost') return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
  const parts = host.split('.');
  if (parts.length < 3) return '';
  return parts[0];
}

async function resolveTenant(req, _res, next) {
  try {
    let slug = '';

    if (config.tenantResolutionMode === 'header') {
      slug = String(req.headers['x-tenant-slug'] || '').trim().toLowerCase();
    } else {
      slug = extractSlugFromHost(req.headers.host);
      if (!slug) {
        slug = String(req.headers['x-tenant-slug'] || '').trim().toLowerCase();
      }
    }

    if (!slug && config.tenantFallbackSlug) {
      slug = config.tenantFallbackSlug;
    }

    if (!slug) return next();

    const tenant = await tenantsRepo.findTenantBySlug(getPool(), slug);
    if (!tenant) return next();

    req.context.tenant = {
      ...tenant,
      source: slug === config.tenantFallbackSlug ? 'fallback' : (req.headers['x-tenant-slug'] ? 'header' : 'host')
    };

    if (req.context.user) {
      const membership = await tenantsRepo.findTenantMembership(getPool(), tenant.id, req.context.user.id);
      if (membership) {
        req.context.membership = membership;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  extractSlugFromHost,
  resolveTenant
};
