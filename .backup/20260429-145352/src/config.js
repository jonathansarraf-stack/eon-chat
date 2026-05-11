'use strict';

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

function asBool(value, fallback) {
  if (value === undefined) return fallback;
  return value === '1' || value === 'true';
}

module.exports = {
  port: Number(process.env.CONTROL_PLANE_PORT || 4080),
  databaseUrl: process.env.DATABASE_URL || '',
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'eon_cp_session',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 14),
  tenantResolutionMode: process.env.TENANT_RESOLUTION_MODE || 'host',
  tenantFallbackSlug: process.env.TENANT_FALLBACK_SLUG || '',
  defaultWorkspaceName: process.env.DEFAULT_WORKSPACE_NAME || 'Default workspace',
  defaultPlanId: process.env.DEFAULT_PLAN_ID || 'starter',
  secretsMasterKey: process.env.SECRETS_MASTER_KEY || 'change-me-before-production',
  stripeMode: process.env.STRIPE_MODE || 'test',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeTestSecretKey: process.env.STRIPE_TEST_SECRET_KEY || '',
  stripeLiveSecretKey: process.env.STRIPE_LIVE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeTestWebhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET || '',
  stripeLiveWebhookSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET || '',
  stripeSuccessUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/billing/success',
  stripeCancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/billing/cancel',
  stripePortalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL || 'http://localhost:3000/settings/billing',
  stripePriceIds: {
    starter: process.env.STRIPE_STARTER_PRICE_ID || '',
    pro: process.env.STRIPE_PRO_PRICE_ID || '',
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || ''
  },
  stripeTestPriceIds: {
    starter: process.env.STRIPE_TEST_STARTER_PRICE_ID || '',
    pro: process.env.STRIPE_TEST_PRO_PRICE_ID || '',
    enterprise: process.env.STRIPE_TEST_ENTERPRISE_PRICE_ID || ''
  },
  stripeLivePriceIds: {
    starter: process.env.STRIPE_LIVE_STARTER_PRICE_ID || '',
    pro: process.env.STRIPE_LIVE_PRO_PRICE_ID || '',
    enterprise: process.env.STRIPE_LIVE_ENTERPRISE_PRICE_ID || ''
  },
  runtimeRootDir: process.env.RUNTIME_ROOT_DIR || path.join(__dirname, '..', 'runtime'),
  emailRuntimeDir: process.env.EMAIL_RUNTIME_DIR || path.join(__dirname, '..', 'runtime', 'emails'),
  emailDeliveryMode: process.env.EMAIL_DELIVERY_MODE || 'console',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply@eonchat.app',
  emailPollIntervalMs: Number(process.env.EMAIL_POLL_INTERVAL_MS || 2000),
  runPollIntervalMs: Number(process.env.RUN_POLL_INTERVAL_MS || 2000),
  runIdleSleepMs: Number(process.env.RUN_IDLE_SLEEP_MS || 1200),
  runMaxPromptChars: Number(process.env.RUN_MAX_PROMPT_CHARS || 24000),
  providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 30000),
  platformManagedOpenAiKey: process.env.PLATFORM_MANAGED_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
  platformManagedAnthropicKey: process.env.PLATFORM_MANAGED_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${Number(process.env.CONTROL_PLANE_PORT || 4080)}`,
  trustProxy: asBool(process.env.TRUST_PROXY, false),
  migrationsDir: path.join(__dirname, '..', '..', 'sql')
};
