# eon-chat — Contexto do Projeto

## O que é
Control plane multi-tenant SaaS para o Eon Chat — gerencia tenants, usuários, workspaces, ambientes, projetos, sessões de chat e billing via Stripe.

Domínio: **chat.eontech.pro** | Porta pública: **4188** (bridge) → upstream **4180** (app)

---

## Stack
- **Runtime**: Node.js (CommonJS)
- **Framework HTTP**: Express 4 (control plane em `src/`); `http` nativo no `public-bridge.js`
- **Banco**: PostgreSQL (via `pg`)
- **Auth**: sessions com cookie, email verification
- **Billing**: Stripe (checkout, portal, webhooks)
- **Workers**: scripts standalone (`worker.js`, `email-worker.js`) — **não rodam em PM2 atualmente**
- **Testes**: Node.js built-in test runner

---

## Arquitetura

```
src/
  server.js           → entry point (sobe app Express na CONTROL_PLANE_PORT)
  app.js              → setup Express (middlewares, static, json, raw para Stripe webhook)
  routes.js           → express.Router com todas as rotas
  config.js           → configuração centralizada
  auth.js             → middleware de autenticação
  tenant.js           → resolução de tenant por request
  context.js          → request context (org, user, tenant)
  cookies.js          → parsing/serialização de cookies
  crypto.js           → primitivas de hash/encrypt
  secrets.js          → carregamento de segredos
  errors.js           → HttpError e helpers (badRequest, forbidden, unauthorized)
  db.js               → pool PostgreSQL
  services/
    auth-service.js                  → signup, signin, signout, email verify
    tenant-service.js                → bootstrap e listagem de tenants
    workspace-service.js             → workspaces
    environment-service.js           → ambientes + project discovery
    project-service.js               → projetos
    billing-service.js               → Stripe checkout, portal, webhooks
    provider-account-service.js      → contas de providers AI
    chat-service.js                  → sessões, mensagens, runs, eventos
    enterprise-evaluation-service.js → avaliações enterprise
    member-service.js                → convites e membros
    email-delivery-service.js        → envio/entrega de emails
    execution-service.js             → orquestração de execução de runs
    ops-service.js                   → health, retry de emails, requeue de runs
  repositories/       → acesso ao banco por entidade
  execution/          → execução de runs de chat
  providers/          → integrações com providers AI
scripts/
  worker.js                     → loop poll de runs de chat (standalone, fora do PM2)
  email-worker.js               → loop poll de envio de email (standalone, fora do PM2)
  public-bridge.js              → proxy HTTP nativo (PM2: eon-chat-bridge)
  migrate.js                    → migrations do banco
  check-stripe.js               → diagnóstico de billing
  create-super-admin.js         → criação de super admin
  import-legacy-chat-mobile.js  → import de dados legados
sql/                  → migrations SQL (001..004)
tests/                → testes Node built-in (auth, crypto, email-delivery, enterprise-evaluation, member, ops, tenant)
shared/               → scripts/utilitários compartilhados
public/               → assets estáticos do frontend
```

---

## Infraestrutura de Produção (VM eon-tech)

### Caminhos
```
/srv/eon-tech/apps/eon-chat/
  src/                → código-fonte
  scripts/            → workers e utilitários
  sql/                → migrations SQL
  tests/              → testes
  shared/             → utilitários compartilhados
  public/             → frontend estático
  package.json
/srv/eon-tech/runtime/pm2/eon-chat/   → PM2 daemon
```

### Processos PM2
| Nome | Porta | Entry |
|------|-------|-------|
| eon-chat-app | 4180 (CONTROL_PLANE_PORT) | src/server.js |
| eon-chat-bridge | 4188 (PUBLIC_BRIDGE_PORT → upstream 4180) | scripts/public-bridge.js |

> **Atenção**: `worker.js` e `email-worker.js` existem mas não estão registrados no PM2. Runs de chat e envio de email só são processados se algum processo externo os executar.

### Nginx (chat.eontech.pro)
Todo tráfego de `chat.eontech.pro` → `127.0.0.1:4188`

### Banco de dados
PostgreSQL na porta 5432 (host) — banco `eon_chat` (verificar config.js)

### Comandos operacionais
```bash
PM2_HOME=/srv/eon-tech/runtime/pm2/eon-chat pm2 list
PM2_HOME=/srv/eon-tech/runtime/pm2/eon-chat pm2 restart eon-chat-app  # restart eon-chat-bridge separadamente se mudar o proxy
PM2_HOME=/srv/eon-tech/runtime/pm2/eon-chat pm2 logs eon-chat-app
tail -f /srv/eon-tech/runtime/pm2/eon-chat/logs/eon-chat-app-error.log
```

### Migrations
```bash
cd /srv/eon-tech/apps/eon-chat
node scripts/migrate.js
```

---

## Convenções
- Roteamento via `express.Router()` em `src/routes.js` — sem Fastify, sem framework full-stack acima do Express
- Sem ORM — queries SQL diretas via `pg`
- Erros HTTP via `errors.js` (`HttpError`, `badRequest`, `forbidden`, `unauthorized`)
- `requestContext` disponível em todos os handlers via `context.js`
- Stripe webhook usa `express.raw()` (não `json()`) para preservar assinatura
- `public-bridge.js` usa `http` nativo (não Express) por ser apenas proxy reverso
