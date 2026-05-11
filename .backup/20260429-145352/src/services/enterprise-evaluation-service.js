'use strict';

const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden, notFound } = require('../errors');
const evaluationsRepo = require('../repositories/enterprise-evaluations');

const VALID_STATUSES = new Set(['new', 'contacted', 'qualified', 'closed_won', 'closed_lost']);

function assertTenantAdmin(membership) {
  if (!membership || !['owner', 'admin', 'billing_admin'].includes(membership.role)) {
    throw forbidden('enterprise_evaluation_forbidden', 'tenant admin role required');
  }
}

function sanitizeEvaluation(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    company: row.company,
    useCase: row.use_case,
    estimatedSeats: row.estimated_seats,
    status: row.status,
    notes: row.notes_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createEnterpriseEvaluation({ tenant, user, input }) {
  if (!input?.name || !input?.email || !input?.company || !input?.useCase) {
    throw badRequest('enterprise_evaluation_required_fields', 'name, email, company and useCase are required');
  }

  const created = await withTransaction((db) => evaluationsRepo.createEnterpriseEvaluation(db, {
    tenantId: tenant?.id || null,
    userId: user?.id || null,
    name: input.name,
    email: input.email,
    company: input.company,
    useCase: input.useCase,
    estimatedSeats: input.estimatedSeats ? Number(input.estimatedSeats) : null,
    notes: {
      planId: input.planId || 'enterprise',
      source: input.source || 'control_plane_ui'
    }
  }));

  return sanitizeEvaluation(created);
}

async function listEnterpriseEvaluations({ tenant, membership }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  assertTenantAdmin(membership);
  const rows = await evaluationsRepo.listEnterpriseEvaluationsByTenant(getPool(), tenant.id);
  return rows.map(sanitizeEvaluation);
}

async function updateEnterpriseEvaluation({ tenant, membership, evaluationId, input }) {
  if (!tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  assertTenantAdmin(membership);
  if (!evaluationId) {
    throw badRequest('enterprise_evaluation_id_required', 'evaluation id is required');
  }

  const nextStatus = input?.status ? String(input.status) : '';
  if (nextStatus && !VALID_STATUSES.has(nextStatus)) {
    throw badRequest('enterprise_evaluation_invalid_status', 'status is not supported');
  }

  const notesText = String(input?.notesText || '').trim();
  if (!nextStatus && !notesText) {
    throw badRequest('enterprise_evaluation_update_empty', 'status or notesText is required');
  }

  const updated = await withTransaction((db) => evaluationsRepo.updateEnterpriseEvaluation(db, {
    evaluationId,
    tenantId: tenant.id,
    status: nextStatus || null,
    notesPatch: notesText ? { salesNotes: notesText } : {}
  }));

  if (!updated) {
    throw notFound('enterprise_evaluation_not_found', 'enterprise evaluation not found');
  }

  return sanitizeEvaluation(updated);
}

module.exports = {
  createEnterpriseEvaluation,
  listEnterpriseEvaluations,
  updateEnterpriseEvaluation
};
