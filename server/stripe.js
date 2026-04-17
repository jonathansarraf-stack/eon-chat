'use strict';

/**
 * Stripe integration for Eon Chat subscriptions.
 *
 * Endpoints:
 *   POST /api/license/checkout — creates a Stripe Checkout session
 *   POST /api/license/webhook  — handles Stripe webhooks
 *   POST /api/license/activate — activate a license key
 *   GET  /api/license/status   — get current license status
 *   GET  /api/license/portal   — get Stripe Customer Portal URL
 *
 * Setup:
 *   1. Create a Stripe account at https://stripe.com
 *   2. Create a recurring Price (e.g., $9/month)
 *   3. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID in .env
 *   4. Set up webhook endpoint in Stripe Dashboard pointing to /api/license/webhook
 */

const express = require('express');
const crypto = require('crypto');
const { activateLicense, getStatus, checkLicense } = require('./license');

const router = express.Router();

// Lazy-load Stripe (only if configured)
let stripe = null;
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    try {
      stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (e) {
      console.warn('[stripe] stripe package not installed. Run: npm install stripe');
    }
  }
  return stripe;
}

// ── License Status ──────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const status = getStatus();
  res.json(status);
});

// ── Activate License Key ────────────────────────────────────────────────────
router.post('/activate', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'License key required' });

  const result = await activateLicense(key);
  if (result.ok) {
    res.json({ ok: true, license: result.data });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
});

// ── Create Checkout Session ─────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const s = getStripe();
  if (!s) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return res.status(503).json({ error: 'STRIPE_PRICE_ID not configured' });
  }

  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: (req.body.successUrl || 'http://localhost:3777') + '?license=activated',
      cancel_url: (req.body.cancelUrl || 'http://localhost:3777') + '?license=cancelled',
      metadata: {
        product: 'eon-chat',
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Customer Portal ─────────────────────────────────────────────────────────
router.post('/portal', async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe not configured' });

  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId required' });

  try {
    const session = await s.billingPortal.sessions.create({
      customer: customerId,
      return_url: req.body.returnUrl || 'http://localhost:3777',
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Stripe Webhook ──────────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return res.status(503).send('Webhook secret not configured');

  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, secret);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Generate license key
      const key = `eon_${crypto.randomBytes(24).toString('hex')}`;
      console.log(`[stripe] New subscription: ${session.customer_email} — key: ${key}`);
      // In production, store this in a database and email the key
      // For now, auto-activate locally
      await activateLicense(key);
      break;
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      console.log(`[stripe] Subscription ended: ${event.data.object.id}`);
      // In production, mark the license as expired in your database
      break;
    }

    case 'invoice.payment_failed': {
      console.log(`[stripe] Payment failed: ${event.data.object.customer}`);
      break;
    }
  }

  res.json({ received: true });
});

module.exports = router;
