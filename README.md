# Eon Chat Control Plane

Working multi-tenant SaaS control plane for Eon Chat, with a native Node HTTP server, browser UI, execution worker, Stripe wiring, and provider-account orchestration.

## Scope

This service is the future home for:

- tenant-aware auth
- tenant and workspace management
- Stripe tenant billing
- provider account configuration
- run orchestration and execution
- audit logs
- browser-based operator and tenant UI

## Commands

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run migrate
npm start
npm run worker
npm run email-worker
```

Then open `http://localhost:4080`.

## Stripe Live Catalog

Current live Stripe account: `Orbita` (`acct_1T4qRjLHsKvnkVcs`)

- Starter product: `prod_UOymG6XAaHji2e`
- Starter monthly price: `price_1TQApNLHsKvnkVcsUljPhNsd` (`USD 0/month`)
- Pro product: `prod_ULvsQ2UlbASAvP`
- Pro monthly price: `price_1TNE0MLHsKvnkVcsM8eimsCT` (`USD 9/month`)
- Enterprise product: `prod_UOymoyqLRQRD09`
- Enterprise price: none, handled as custom evaluation

Use [.env.live.example](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/.env.live.example) as the baseline for production wiring.

## Current Routes

- `GET /health`
- `GET /v1/context`
- `POST /v1/auth/signup`
- `POST /v1/auth/signin`
- `POST /v1/auth/signout`
- `POST /v1/auth/request-email-verification`
- `POST /v1/auth/verify-email`
- `POST /v1/tenants/bootstrap`
- `GET /v1/tenants/me`
- `GET /v1/workspaces`
- `GET /v1/members`
- `POST /v1/members/invites`
- `POST /v1/members/accept-invite`
- `GET /v1/billing/summary`
- `GET /v1/billing/health`
- `POST /v1/billing/checkout`
- `POST /v1/billing/portal`
- `POST /v1/billing/webhook`
- `GET /v1/enterprise-evaluations`
- `POST /v1/enterprise-evaluations`
- `PATCH /v1/enterprise-evaluations/:evaluationId`
- `GET /v1/providers/catalog`
- `GET /v1/ops/queue-health`
- `POST /v1/ops/retry-email`
- `POST /v1/ops/requeue-run`
- `GET /v1/provider-accounts`
- `POST /v1/provider-accounts`
- `GET /v1/chat/sessions`
- `POST /v1/chat/sessions`
- `GET /v1/chat/sessions/:sessionId/messages`
- `GET /v1/chat/sessions/:sessionId/runs`
- `GET /v1/chat/sessions/:sessionId/runs/:runId/events`
- `POST /v1/chat/sessions/:sessionId/runs`

## Runtime

- Node-native HTTP server in [`src/server.js`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/src/server.js)
- static browser client in [`public/`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/public)
- queue worker in [`scripts/worker.js`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/scripts/worker.js)
- email outbox worker in [`scripts/email-worker.js`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/scripts/email-worker.js)
- runtime directories written under [`runtime/`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/runtime)
- queue health panel for runs and emails via [`src/services/ops-service.js`](/Users/jonathansarraf/Documents/Codex/2026-04-24-eon-chat/control-plane/src/services/ops-service.js)
- safe retry/requeue controls for failed emails and runs with audit log writes

## Provider Modes

- `byok`: tenant stores its own secret, encrypted locally
- `platform_managed`: the control plane uses `PLATFORM_MANAGED_OPENAI_API_KEY` or `PLATFORM_MANAGED_ANTHROPIC_API_KEY`

## Current Limitations

- sensitive write actions now require a verified email, but read-only browsing still works for signed-in users
- real successful provider execution still depends on valid upstream credentials being configured
- Stripe is fully wired in code, but live/test checkout still depends on real secret keys, webhook secret, and price IDs
- email verification and invite delivery now have an `email_outbox` worker, but delivery is still local `console`/artifact based until an SMTP or API provider is plugged in
- secrets are encrypted locally with an app key, but not yet backed by KMS/HSM
- there is no websocket/SSE stream yet; the UI currently polls runs, messages, and run events
