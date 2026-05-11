'use strict';

async function createAuditLog(db, { tenantId, actorUserId, action, targetType, targetId, metadata }) {
  const result = await db.query(
    `insert into audit_logs (tenant_id, actor_user_id, action, target_type, target_id, metadata_json)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     returning id, tenant_id, actor_user_id, action, target_type, target_id, metadata_json, created_at`,
    [
      tenantId || null,
      actorUserId || null,
      action,
      targetType,
      targetId || null,
      JSON.stringify(metadata || {})
    ]
  );
  return result.rows[0];
}

module.exports = {
  createAuditLog
};
