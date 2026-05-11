'use strict';

const config = require('../config');
const { getPool, withTransaction } = require('../db');
const { badRequest, forbidden } = require('../errors');
const billingRepo = require('../repositories/billing');

let stripeClient = null;

function stripeMode() {
  return config.stripeMode === 'live' ? 'live' : 'test';
}

function activeStripeSecretKey() {
  if (config.stripeSecretKey) return config.stripeSecretKey;
  return stripeMode() === 'live' ? config.stripeLiveSecretKey : config.stripeTestSecretKey;
}

function activeWebhookSecret() {
  if (config.stripeWebhookSecret) return config.stripeWebhookSecret;
  return stripeMode() === 'live' ? config.stripeLiveWebhookSecret : config.stripeTestWebhookSecret;
}

function activePriceIds() {
  const mode = stripeMode();
  const scoped = mode === 'live' ? config.stripeLivePriceIds : config.stripeTestPriceIds;
  const hasScopedValues = Object.values(scoped).some(Boolean);
  return hasScopedValues ? scoped : config.stripePriceIds;
}

function getStripe() {
  const secretKey = activeStripeSecretKey();
  if (!secretKey) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover'
    });
  }
  return stripeClient;
}

function assertBillingRole(membership) {
  if (!membership || !['owner', 'admin', 'billing_admin'].includes(membership.role)) {
    throw forbidden('billing_forbidden', 'billing access requires admin or billing role');
  }
}

function priceIdForPlan(planId) {
  if (planId === 'enterprise') {
    throw badRequest(
      'custom_evaluation_required',
      'enterprise uses custom evaluation and cannot be purchased through self-serve checkout'
    );
  }
  const priceId = activePriceIds()[planId];
  if (!priceId) {
    throw badRequest('missing_price_mapping', `no Stripe price configured for plan ${planId}`);
  }
  return priceId;
}

async function ensureStripeCustomer(tenant) {
  const db = getPool();
  const existing = await billingRepo.getBillingCustomerByTenantId(db, tenant.id);
  const stripe = getStripe();

  if (existing && existing.stripe_customer_id && !existing.stripe_customer_id.startsWith('pending_')) {
    return existing;
  }

  if (!stripe) {
    return existing;
  }

  const customer = await stripe.customers.create({
    name: tenant.name,
    metadata: {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug
    }
  });

  return withTransaction((tx) => billingRepo.upsertBillingCustomer(tx, {
    tenantId: tenant.id,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: existing?.stripe_subscription_id || null,
    status: existing?.status || 'inactive',
    currentPeriodEndsAt: existing?.current_period_ends_at || null
  }));
}

async function getBillingSummary(tenantId) {
  if (!tenantId) return null;
  const result = await getPool().query(
    `select
       t.id as tenant_id,
       t.name as tenant_name,
       t.slug as tenant_slug,
       t.plan_id,
       t.status as tenant_status,
       bc.stripe_customer_id,
       bc.stripe_subscription_id,
       bc.status as billing_status,
       bc.current_period_ends_at,
       p.name as plan_name,
       p.seat_limit,
       p.workspace_limit,
       p.monthly_run_limit,
       p.monthly_cost_limit_cents,
       p.features_json
     from tenants t
     left join billing_customers bc on bc.tenant_id = t.id
     left join plans p on p.id = t.plan_id
     where t.id = $1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

async function createCheckoutSession({ tenant, membership, successUrl, cancelUrl }) {
  assertBillingRole(membership);
  const stripe = getStripe();
  if (!stripe) {
    throw badRequest('stripe_not_configured', 'Stripe is not configured');
  }

  const billingCustomer = await ensureStripeCustomer(tenant);
  const priceId = priceIdForPlan(tenant.plan_id);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: billingCustomer.stripe_customer_id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl || config.stripeSuccessUrl,
    cancel_url: cancelUrl || config.stripeCancelUrl,
    metadata: {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      plan_id: tenant.plan_id
    }
  });

  return { url: session.url, id: session.id };
}

async function createPortalSession({ tenant, membership, returnUrl }) {
  assertBillingRole(membership);
  const stripe = getStripe();
  if (!stripe) {
    throw badRequest('stripe_not_configured', 'Stripe is not configured');
  }
  const billingCustomer = await ensureStripeCustomer(tenant);
  if (!billingCustomer?.stripe_customer_id || billingCustomer.stripe_customer_id.startsWith('pending_')) {
    throw badRequest('billing_customer_missing', 'tenant has no Stripe customer yet');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billingCustomer.stripe_customer_id,
    return_url: returnUrl || config.stripePortalReturnUrl
  });

  return { url: session.url };
}

function toTimestamp(value) {
  if (!value) return null;
  return new Date(value * 1000);
}

async function processWebhook({ rawBody, signature }) {
  const stripe = getStripe();
  const webhookSecret = activeWebhookSecret();
  if (!stripe || !webhookSecret) {
    throw badRequest('stripe_not_configured', 'Stripe webhook is not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw badRequest('invalid_webhook_signature', err.message);
  }

  const object = event.data.object;
  const tenantId = object.metadata?.tenant_id || null;

  await withTransaction(async (tx) => {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (tenantId) {
          await billingRepo.upsertBillingCustomer(tx, {
            tenantId,
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.subscription || null,
            status: 'active',
            currentPeriodEndsAt: null
          });
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        if (tenantId) {
          await billingRepo.upsertBillingCustomer(tx, {
            tenantId,
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.id,
            status: object.status,
            currentPeriodEndsAt: toTimestamp(object.current_period_end)
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        if (tenantId) {
          await billingRepo.upsertBillingCustomer(tx, {
            tenantId,
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.id,
            status: 'cancelled',
            currentPeriodEndsAt: toTimestamp(object.current_period_end)
          });
        }
        break;
      }

      default:
        break;
    }

    await billingRepo.createBillingEvent(tx, {
      tenantId,
      stripeEventId: event.id,
      eventType: event.type,
      payload: event,
      processedAt: new Date()
    });
  });

  return { received: true, type: event.type };
}

async function getBillingHealth() {
  const stripe = getStripe();
  const priceIds = activePriceIds();
  const configured = Boolean(activeStripeSecretKey());
  const account = stripe ? await stripe.accounts.retrieve() : null;

  return {
    mode: stripeMode(),
    configured,
    webhookConfigured: Boolean(activeWebhookSecret()),
    priceIds,
    account: account ? {
      id: account.id,
      country: account.country,
      email: account.email,
      businessType: account.business_type || null
    } : null
  };
}

module.exports = {
  getBillingSummary,
  createCheckoutSession,
  createPortalSession,
  processWebhook,
  getBillingHealth
};
