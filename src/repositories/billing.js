'use strict';

async function getBillingCustomerByTenantId(db, tenantId) {
  const result = await db.query(
    `select id, tenant_id, stripe_customer_id, stripe_subscription_id, status, current_period_ends_at, created_at, updated_at
     from billing_customers where tenant_id = $1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

async function upsertBillingCustomer(db, { tenantId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEndsAt }) {
  const result = await db.query(
    `insert into billing_customers (tenant_id, stripe_customer_id, stripe_subscription_id, status, current_period_ends_at)
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id) do update set
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = excluded.status,
       current_period_ends_at = excluded.current_period_ends_at,
       updated_at = now()
     returning id, tenant_id, stripe_customer_id, stripe_subscription_id, status, current_period_ends_at, created_at, updated_at`,
    [tenantId, stripeCustomerId, stripeSubscriptionId || null, status || 'inactive', currentPeriodEndsAt || null]
  );
  return result.rows[0];
}

async function createBillingEvent(db, { tenantId, stripeEventId, eventType, payload, processedAt }) {
  const result = await db.query(
    `insert into billing_events (tenant_id, stripe_event_id, event_type, payload_json, processed_at)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (stripe_event_id) do update set
       processed_at = excluded.processed_at
     returning id, stripe_event_id`,
    [tenantId || null, stripeEventId, eventType, JSON.stringify(payload), processedAt || null]
  );
  return result.rows[0];
}

module.exports = {
  getBillingCustomerByTenantId,
  upsertBillingCustomer,
  createBillingEvent
};
