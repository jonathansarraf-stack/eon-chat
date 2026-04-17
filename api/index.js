'use strict';

// Load .env
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^\s*([^#][^=]+?)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  });
}

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.API_PORT || 3888;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', service: 'eon-chat-api' });
});

// ── Verify License ──────────────────────────────────────────────────────────
// Called by the user's local server to validate their key
app.post('/v1/license/verify', express.json(), (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'key required' });

  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);

  if (!license) {
    return res.json({ valid: false, error: 'License not found' });
  }

  if (license.status !== 'active') {
    return res.json({ valid: false, error: `License ${license.status}` });
  }

  // Check expiration
  if (license.expires_at && license.expires_at < Math.floor(Date.now() / 1000)) {
    db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
    return res.json({ valid: false, error: 'License expired' });
  }

  // Update last verified
  db.prepare('UPDATE licenses SET last_verified_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), license.id);

  res.json({
    valid: true,
    email: license.email,
    plan: license.plan,
    expiresAt: license.expires_at ? license.expires_at * 1000 : null,
  });
});

// ── Generate License (internal / after payment) ─────────────────────────────
function generateLicense(email, plan, stripeCustomerId, stripeSubscriptionId) {
  const key = `eon_${crypto.randomBytes(24).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO licenses (key, email, plan, status, stripe_customer_id, stripe_subscription_id, created_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).run(key, email, plan, stripeCustomerId || null, stripeSubscriptionId || null, now);

  return key;
}

// ── Stripe Webhook ──────────────────────────────────────────────────────────
app.post('/v1/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Stripe not configured');
  }

  let stripe;
  try {
    stripe = require('stripe')(STRIPE_SECRET);
  } catch {
    return res.status(503).send('stripe package not installed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[webhook] Signature verification failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email || 'unknown';
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      const key = generateLicense(email, 'pro', customerId, subscriptionId);
      console.log(`[license] Created for ${email}: ${key.slice(0, 12)}...`);

      // TODO: send email with license key via SendGrid/Resend/etc.
      // For now, the key is returned in the checkout success URL
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      if (sub.status === 'active') {
        db.prepare('UPDATE licenses SET status = ? WHERE stripe_subscription_id = ?')
          .run('active', sub.id);
        console.log(`[license] Reactivated: ${sub.id}`);
      }
      break;
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const sub = event.data.object;
      db.prepare('UPDATE licenses SET status = ? WHERE stripe_subscription_id = ?')
        .run('cancelled', sub.id);
      console.log(`[license] Cancelled: ${sub.id}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log(`[billing] Payment failed for customer: ${invoice.customer}`);
      // Grace period — don't immediately cancel
      break;
    }
  }

  res.json({ received: true });
});

// ── Create Checkout Session ─────────────────────────────────────────────────
// Called by the landing page to start a subscription
app.post('/v1/checkout', express.json(), (req, res) => {
  if (!STRIPE_SECRET) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let stripe;
  try {
    stripe = require('stripe')(STRIPE_SECRET);
  } catch {
    return res.status(503).json({ error: 'stripe not installed' });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return res.status(503).json({ error: 'STRIPE_PRICE_ID not set' });
  }

  const successUrl = req.body.successUrl || process.env.LANDING_URL || 'https://eon.chat';
  const cancelUrl = req.body.cancelUrl || process.env.LANDING_URL || 'https://eon.chat';

  stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cancelUrl}?cancelled=true`,
    metadata: { product: 'eon-chat' },
  })
    .then(session => res.json({ url: session.url }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// ── Get License Key from Checkout Session ───────────────────────────────────
// Called after successful checkout to retrieve the generated key
app.get('/v1/checkout/:sessionId/license', async (req, res) => {
  if (!STRIPE_SECRET) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let stripe;
  try {
    stripe = require('stripe')(STRIPE_SECRET);
  } catch {
    return res.status(503).json({ error: 'stripe not installed' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const customerId = session.customer;

    const license = db.prepare('SELECT key, email, plan FROM licenses WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(customerId);

    if (license) {
      res.json({ key: license.key, email: license.email, plan: license.plan });
    } else {
      res.status(404).json({ error: 'License not yet created. Wait a moment and try again.' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: List licenses (protected) ────────────────────────────────────────
app.get('/v1/admin/licenses', (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const licenses = db.prepare(`
    SELECT id, key, email, plan, status, created_at, expires_at, last_verified_at
    FROM licenses ORDER BY created_at DESC LIMIT 100
  `).all();

  res.json(licenses);
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM licenses').get().c;
  console.log(`[eon-chat-api] running on http://localhost:${PORT}`);
  console.log(`[eon-chat-api] ${count} licenses in database`);
});
