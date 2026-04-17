# Stripe Setup — Eon Chat

## 1. Create Stripe Account

Go to https://stripe.com and create an account (or use existing).

## 2. Create Product + Price

In Stripe Dashboard:
1. Go to **Products** > **Add product**
2. Name: `Eon Chat Pro`
3. Description: `Mobile-first chat interface for Claude Code`
4. Pricing: **Recurring** > **$9.00 / month**
5. Save and copy the **Price ID** (starts with `price_`)

## 3. Get API Keys

In Stripe Dashboard:
1. Go to **Developers** > **API keys**
2. Copy the **Secret key** (starts with `sk_live_` or `sk_test_`)

## 4. Set Up Webhook

In Stripe Dashboard:
1. Go to **Developers** > **Webhooks**
2. **Add endpoint**
3. URL: `https://api.eon.chat/v1/stripe/webhook` (or your API URL)
4. Events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `invoice.payment_failed`
5. Copy the **Webhook signing secret** (starts with `whsec_`)

## 5. Configure .env

In `/root/eon-chat/api/.env`:

```
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID=price_xxxxx
LANDING_URL=https://eon.chat
ADMIN_API_KEY=your-random-secret-here
```

## 6. Test

```bash
# Start the API
cd api && node index.js

# Test checkout (will return Stripe URL)
curl -s -X POST http://localhost:3888/v1/checkout \
  -H 'Content-Type: application/json' \
  -d '{"successUrl":"http://localhost:3888","cancelUrl":"http://localhost:3888"}'
```

## 7. Deploy

The API server needs to be accessible at `api.eon.chat` (or whatever domain).
Options:
- Run on this VM with nginx reverse proxy
- Deploy to Railway/Fly.io/Render
- Use Cloudflare Tunnel

The landing page is served by the same API at the root URL.
