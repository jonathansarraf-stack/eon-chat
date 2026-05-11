# eon-chat — Contexto do Projeto

## O que é
Control plane multi-tenant SaaS para o Eon Chat — gerencia tenants, usuários, workspaces, ambientes, projetos, sessões de chat e billing via Stripe.

Domínio: **chat.eontech.pro** | Porta: **4188**

---

## Stack
- **Runtime**: Node.js (CommonJS), sem framework (http nativo)
- **Banco**: PostgreSQL (via `pg`)
- **Auth**: sessions com cookie, email verification
- **Billing**: Stripe (checkout, portal, webhooks)
- **Fila**: workers assíncronos (email, descoberta de projetos, runs de chat)
- **Testes**: Node.js built-in test runner

---

## Arquitetura

```
src/
  server.js           → entry point, roteamento manual
  app.js              → setup da aplicação
  config.js           → configuração centralizada
  auth.js             → middleware de autenticação
  tenant.js           → resolução de tenant por request
  context.js          → request context (org, user, tenant)
  db.js               → pool PostgreSQL
  routes.js           → definição das rotas
  services/
    auth-service.js              → signup, signin, signout, email verify
    tenant-service.js            → bootstrap e listagem de tenants
    workspace-service.js         → workspaces
    environment-service.js       → ambientes + project discovery
    project-service.js           → projetos
    billing-service.js           → Stripe checkout, portal, webhooks
    provider-account-service.js  → contas de providers AI
    chat-service.js              → sessões, mensagens, runs, eventos
    enterprise-evaluation-service.js → avaliações enterprise
    member-service.js            → convites e membros
    ops-service.js               → health, retry de emails, requeue de runs
  repositories/       → acesso ao banco por entidade
  execution/          → execução de runs de chat
  providers/          → integrações com providers AI
scripts/
  worker.js           → worker de runs de chat
  email-worker.js     → worker de envio de email
  migrate.js          → migrations do banco
  check-stripe.js     → diagnóstico de billing
public/               → assets estáticos do frontend
```

---

## Infraestrutura de Produção (VM eon-tech)

### Caminhos
```
/srv/eon-tech/apps/eon-chat/
  src/                → código-fonte
  scripts/            → workers e utilitários
  public/             → frontend estático
  package.json
/srv/eon-tech/runtime/pm2/eon-chat/   → PM2 daemon
```

### Processos PM2
| Nome | Porta | Entry |
|------|-------|-------|
| eon-chat-app | 4188 | src/server.js |
| eon-chat-bridge | — | scripts/worker.js (bridge de runs) |

### Nginx (chat.eontech.pro)
Todo tráfego de `chat.eontech.pro` → `127.0.0.1:4188`

### Banco de dados
PostgreSQL na porta 5432 (host) — banco `eon_chat` (verificar config.js)

### Comandos operacionais
```bash
PM2_HOME=/srv/eon-tech/runtime/pm2/eon-chat pm2 list
PM2_HOME=/srv/eon-tech/runtime/pm2/eon-chat pm2 restart eon-chat-app
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
- Roteamento manual sem framework — sem Express router, sem Fastify
- Sem ORM — queries SQL diretas via `pg`
- Erros HTTP via `errors.js` (`HttpError`, `badRequest`, `forbidden`, `unauthorized`)
- `requestContext` disponível em todos os handlers via `context.js`
- Workers são processos PM2 separados (`eon-chat-bridge`)
