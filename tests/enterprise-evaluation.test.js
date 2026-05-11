'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  };
}

function loadService(overrides = {}) {
  const servicePath = require.resolve('../src/services/enterprise-evaluation-service');
  const dbPath = require.resolve('../src/db');
  const repoPath = require.resolve('../src/repositories/enterprise-evaluations');

  delete require.cache[servicePath];
  delete require.cache[dbPath];
  delete require.cache[repoPath];

  mockModule('../src/db', {
    getPool: overrides.getPool || (() => ({ kind: 'pool' })),
    withTransaction: overrides.withTransaction || (async (fn) => fn({ kind: 'tx' }))
  });

  mockModule('../src/repositories/enterprise-evaluations', {
    createEnterpriseEvaluation: overrides.createEnterpriseEvaluation || (async (_db, input) => ({
      id: 'eval_123',
      tenant_id: input.tenantId,
      user_id: input.userId,
      name: input.name,
      email: input.email,
      company: input.company,
      use_case: input.useCase,
      estimated_seats: input.estimatedSeats,
      status: 'new',
      notes_json: input.notes,
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T00:00:00.000Z'
    })),
    listEnterpriseEvaluationsByTenant: overrides.listEnterpriseEvaluationsByTenant || (async () => []),
    updateEnterpriseEvaluation: overrides.updateEnterpriseEvaluation || (async (_db, input) => ({
      id: input.evaluationId,
      tenant_id: input.tenantId,
      user_id: 'user_456',
      name: 'Ana',
      email: 'ana@acme.com',
      company: 'Acme',
      use_case: 'Internal copilots',
      estimated_seats: 40,
      status: input.status || 'new',
      notes_json: input.notesPatch || {},
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T01:00:00.000Z'
    }))
  });

  return require('../src/services/enterprise-evaluation-service');
}

test('createEnterpriseEvaluation persists normalized enterprise request', async () => {
  let capturedInput = null;
  const service = loadService({
    createEnterpriseEvaluation: async (_db, input) => {
      capturedInput = input;
      return {
        id: 'eval_123',
        tenant_id: input.tenantId,
        user_id: input.userId,
        name: input.name,
        email: input.email,
        company: input.company,
        use_case: input.useCase,
        estimated_seats: input.estimatedSeats,
        status: 'new',
        notes_json: input.notes,
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T00:00:00.000Z'
      };
    }
  });

  const result = await service.createEnterpriseEvaluation({
    tenant: { id: 'tenant_123' },
    user: { id: 'user_456' },
    input: {
      name: 'Ana',
      email: 'ana@acme.com',
      company: 'Acme',
      useCase: 'Team coding copilots',
      estimatedSeats: '25',
      planId: 'enterprise',
      source: 'billing_page'
    }
  });

  assert.deepEqual(capturedInput, {
    tenantId: 'tenant_123',
    userId: 'user_456',
    name: 'Ana',
    email: 'ana@acme.com',
    company: 'Acme',
    useCase: 'Team coding copilots',
    estimatedSeats: 25,
    notes: {
      planId: 'enterprise',
      source: 'billing_page'
    }
  });

  assert.equal(result.company, 'Acme');
  assert.equal(result.estimatedSeats, 25);
  assert.deepEqual(result.notes, {
    planId: 'enterprise',
    source: 'billing_page'
  });
});

test('createEnterpriseEvaluation requires key fields', async () => {
  const service = loadService();

  await assert.rejects(
    service.createEnterpriseEvaluation({
      tenant: { id: 'tenant_123' },
      user: { id: 'user_456' },
      input: {
        name: 'Ana',
        email: '',
        company: 'Acme',
        useCase: ''
      }
    }),
    (error) => {
      assert.equal(error.code, 'enterprise_evaluation_required_fields');
      return true;
    }
  );
});

test('listEnterpriseEvaluations requires tenant admin membership', async () => {
  const service = loadService();

  await assert.rejects(
    service.listEnterpriseEvaluations({
      tenant: { id: 'tenant_123' },
      membership: { role: 'member' }
    }),
    (error) => {
      assert.equal(error.code, 'enterprise_evaluation_forbidden');
      return true;
    }
  );
});

test('listEnterpriseEvaluations returns sanitized rows for tenant admins', async () => {
  const service = loadService({
    listEnterpriseEvaluationsByTenant: async (_db, tenantId) => [{
      id: 'eval_123',
      tenant_id: tenantId,
      user_id: 'user_456',
      name: 'Ana',
      email: 'ana@acme.com',
      company: 'Acme',
      use_case: 'Internal copilots',
      estimated_seats: 40,
      status: 'qualified',
      notes_json: { source: 'control_plane_ui' },
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T00:00:00.000Z'
    }]
  });

  const rows = await service.listEnterpriseEvaluations({
    tenant: { id: 'tenant_123' },
    membership: { role: 'billing_admin' }
  });

  assert.deepEqual(rows, [{
    id: 'eval_123',
    tenantId: 'tenant_123',
    userId: 'user_456',
    name: 'Ana',
    email: 'ana@acme.com',
    company: 'Acme',
    useCase: 'Internal copilots',
    estimatedSeats: 40,
    status: 'qualified',
    notes: { source: 'control_plane_ui' },
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z'
  }]);
});

test('updateEnterpriseEvaluation validates supported status values', async () => {
  const service = loadService();

  await assert.rejects(
    service.updateEnterpriseEvaluation({
      tenant: { id: 'tenant_123' },
      membership: { role: 'admin' },
      evaluationId: 'eval_123',
      input: {
        status: 'wrong_status'
      }
    }),
    (error) => {
      assert.equal(error.code, 'enterprise_evaluation_invalid_status');
      return true;
    }
  );
});

test('updateEnterpriseEvaluation persists status and sales notes for tenant admins', async () => {
  let capturedInput = null;
  const service = loadService({
    updateEnterpriseEvaluation: async (_db, input) => {
      capturedInput = input;
      return {
        id: 'eval_123',
        tenant_id: input.tenantId,
        user_id: 'user_456',
        name: 'Ana',
        email: 'ana@acme.com',
        company: 'Acme',
        use_case: 'Internal copilots',
        estimated_seats: 40,
        status: input.status,
        notes_json: { salesNotes: input.notesPatch.salesNotes },
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T01:00:00.000Z'
      };
    }
  });

  const result = await service.updateEnterpriseEvaluation({
    tenant: { id: 'tenant_123' },
    membership: { role: 'billing_admin' },
    evaluationId: 'eval_123',
    input: {
      status: 'qualified',
      notesText: 'Security review scheduled for next week'
    }
  });

  assert.deepEqual(capturedInput, {
    evaluationId: 'eval_123',
    tenantId: 'tenant_123',
    status: 'qualified',
    notesPatch: {
      salesNotes: 'Security review scheduled for next week'
    }
  });

  assert.equal(result.status, 'qualified');
  assert.equal(result.notes.salesNotes, 'Security review scheduled for next week');
});
