'use strict';

async function createEnterpriseEvaluation(db, {
  tenantId,
  userId,
  name,
  email,
  company,
  useCase,
  estimatedSeats,
  notes
}) {
  const result = await db.query(
    `insert into enterprise_evaluations
      (tenant_id, user_id, name, email, company, use_case, estimated_seats, notes_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id, tenant_id, user_id, name, email, company, use_case, estimated_seats, status, notes_json, created_at, updated_at`,
    [
      tenantId || null,
      userId || null,
      name,
      email,
      company,
      useCase,
      estimatedSeats || null,
      JSON.stringify(notes || {})
    ]
  );
  return result.rows[0];
}

async function listEnterpriseEvaluationsByTenant(db, tenantId) {
  const result = await db.query(
    `select id, tenant_id, user_id, name, email, company, use_case, estimated_seats, status, notes_json, created_at, updated_at
     from enterprise_evaluations
     where tenant_id = $1
     order by created_at desc`,
    [tenantId]
  );
  return result.rows;
}

async function updateEnterpriseEvaluation(db, { evaluationId, tenantId, status, notesPatch }) {
  const result = await db.query(
    `update enterprise_evaluations
     set status = coalesce($3, status),
         notes_json = coalesce(notes_json, '{}'::jsonb) || $4::jsonb,
         updated_at = now()
     where id = $1 and tenant_id = $2
     returning id, tenant_id, user_id, name, email, company, use_case, estimated_seats, status, notes_json, created_at, updated_at`,
    [
      evaluationId,
      tenantId,
      status || null,
      JSON.stringify(notesPatch || {})
    ]
  );
  return result.rows[0] || null;
}

module.exports = {
  createEnterpriseEvaluation,
  listEnterpriseEvaluationsByTenant,
  updateEnterpriseEvaluation
};
