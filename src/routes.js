'use strict';

const express = require('express');
const config = require('./config');
const { serializeCookie, clearCookie } = require('./cookies');
const { requireUser, requireVerifiedUser } = require('./auth');
const { HttpError, badRequest, forbidden } = require('./errors');
const { signUp, signIn, signOut } = require('./services/auth-service');
const { bootstrapTenant, listUserTenants } = require('./services/tenant-service');
const { getBillingSummary, createCheckoutSession, createPortalSession, processWebhook, getBillingHealth } = require('./services/billing-service');
const { createProviderAccount, listProviderAccounts, listSupportedProviders } = require('./services/provider-account-service');
const { listWorkspaces } = require('./services/workspace-service');
const { listEnvironments, createEnvironment, updateEnvironment, queueProjectDiscovery, listDiscoveryRequests } = require('./services/environment-service');
const { listProjects, createProject, updateProject } = require('./services/project-service');
const { listChatSessions, createChatSession, listMessages, listRuns, listRunEvents, queueRun } = require('./services/chat-service');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function setSessionCookie(res, rawToken) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', serializeCookie(config.sessionCookieName, rawToken, {
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
    sameSite: 'Lax',
    secure,
    path: '/'
  }));
}

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'eon-chat-control-plane'
  });
});

router.post('/v1/auth/signup', asyncHandler(async (req, res) => {
  const result = await signUp({
    email: req.body?.email,
    password: req.body?.password,
    name: req.body?.name,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  setSessionCookie(res, result.sessionToken);
  res.status(201).json({ user: result.user });
}));

router.post('/v1/auth/signin', asyncHandler(async (req, res) => {
  const result = await signIn({
    email: req.body?.email,
    password: req.body?.password,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  setSessionCookie(res, result.sessionToken);
  res.json({ user: result.user });
}));

router.post('/v1/auth/signout', asyncHandler(async (req, res) => {
  await signOut(req.context.sessionToken);
  res.setHeader('Set-Cookie', clearCookie(config.sessionCookieName, { sameSite: 'Lax', path: '/' }));
  res.json({ ok: true });
}));

router.get('/v1/context', asyncHandler(async (req, res) => {
  const userTenants = req.context.user ? await listUserTenants(req.context.user.id) : [];
  res.json({
    requestId: req.context.requestId,
    tenant: req.context.tenant,
    membership: req.context.membership || null,
    user: req.context.user,
    tenants: userTenants
  });
}));

router.post('/v1/tenants/bootstrap', requireUser, asyncHandler(async (req, res) => {
  const result = await bootstrapTenant({
    userId: req.context.user.id,
    tenantName: req.body?.tenantName,
    tenantSlug: req.body?.tenantSlug,
    workspaceName: req.body?.workspaceName,
    planId: req.body?.planId
  });

  res.status(201).json(result);
}));

router.get('/v1/tenants/me', requireUser, asyncHandler(async (req, res) => {
  const tenants = await listUserTenants(req.context.user.id);
  res.json({ tenants });
}));

router.get('/v1/workspaces', requireUser, asyncHandler(async (req, res) => {
  const workspaces = await listWorkspaces({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user
  });
  res.json({ workspaces });
}));

router.get('/v1/environments', requireUser, asyncHandler(async (req, res) => {
  const environments = await listEnvironments({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : ''
  });
  res.json({ environments });
}));

router.post('/v1/environments', requireUser, requireVerifiedUser, asyncHandler(async (req, res) => {
  const environment = await createEnvironment({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.body?.workspaceId,
    name: req.body?.name,
    slug: req.body?.slug,
    kind: req.body?.kind,
    host: req.body?.host,
    port: req.body?.port,
    agentIdentifier: req.body?.agentIdentifier,
    metadata: req.body?.metadata
  });
  res.status(201).json({ environment });
}));

router.patch('/v1/environments/:environmentId', requireUser, requireVerifiedUser, asyncHandler(async (req, res) => {
  const environment = await updateEnvironment({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    environmentId: req.params.environmentId,
    input: req.body
  });
  res.json({ environment });
}));

router.get('/v1/environments/:environmentId/discovery-requests', requireUser, asyncHandler(async (req, res) => {
  const requests = await listDiscoveryRequests({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    environmentId: req.params.environmentId
  });
  res.json({ requests });
}));

router.post('/v1/environments/:environmentId/discovery-requests', requireUser, requireVerifiedUser, asyncHandler(async (req, res) => {
  const result = await queueProjectDiscovery({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    environmentId: req.params.environmentId,
    strategy: req.body?.strategy,
    request: req.body?.request
  });
  res.status(202).json(result);
}));

router.get('/v1/projects', requireUser, asyncHandler(async (req, res) => {
  const projects = await listProjects({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : '',
    environmentId: req.query.environmentId ? String(req.query.environmentId) : null
  });
  res.json({ projects });
}));

router.post('/v1/projects', requireUser, requireVerifiedUser, asyncHandler(async (req, res) => {
  const project = await createProject({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.body?.workspaceId,
    environmentId: req.body?.environmentId,
    name: req.body?.name,
    slug: req.body?.slug,
    rootPath: req.body?.rootPath,
    source: req.body?.source,
    metadata: req.body?.metadata
  });
  res.status(201).json({ project });
}));

router.patch('/v1/projects/:projectId', requireUser, requireVerifiedUser, asyncHandler(async (req, res) => {
  const project = await updateProject({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    projectId: req.params.projectId,
    input: req.body
  });
  res.json({ project });
}));

router.get('/v1/billing/summary', requireUser, asyncHandler(async (req, res) => {
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  if (!req.context.membership || !['owner', 'admin', 'billing_admin'].includes(req.context.membership.role)) {
    throw forbidden('billing_forbidden', 'billing access requires admin or billing role');
  }
  const summary = await getBillingSummary(req.context.tenant.id);
  res.json({ summary });
}));

router.get('/v1/billing/health', requireUser, asyncHandler(async (req, res) => {
  const health = await getBillingHealth();
  res.json({ health });
}));

router.post('/v1/billing/checkout', requireUser, asyncHandler(async (req, res) => {
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  const session = await createCheckoutSession({
    tenant: req.context.tenant,
    membership: req.context.membership,
    successUrl: req.body?.successUrl,
    cancelUrl: req.body?.cancelUrl
  });
  res.json(session);
}));

router.post('/v1/billing/portal', requireUser, asyncHandler(async (req, res) => {
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  const session = await createPortalSession({
    tenant: req.context.tenant,
    membership: req.context.membership,
    returnUrl: req.body?.returnUrl
  });
  res.json(session);
}));

router.post('/v1/billing/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const result = await processWebhook({
    rawBody: req.body,
    signature: req.headers['stripe-signature']
  });
  res.json(result);
}));

router.get('/v1/providers/catalog', requireUser, asyncHandler(async (_req, res) => {
  const providers = await listSupportedProviders();
  res.json({ providers });
}));

router.get('/v1/provider-accounts', requireUser, asyncHandler(async (req, res) => {
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  const accounts = await listProviderAccounts({
    tenant: req.context.tenant,
    membership: req.context.membership,
    workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : null
  });
  res.json({ accounts });
}));

router.post('/v1/provider-accounts', requireUser, asyncHandler(async (req, res) => {
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
  const account = await createProviderAccount({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    provider: req.body?.provider,
    mode: req.body?.mode,
    displayName: req.body?.displayName,
    secret: req.body?.secret,
    config: req.body?.config,
    workspaceId: req.body?.workspaceId
  });
  res.status(201).json({ account });
}));

router.get('/v1/chat/sessions', requireUser, asyncHandler(async (req, res) => {
  const sessions = await listChatSessions({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : '',
    environmentId: req.query.environmentId ? String(req.query.environmentId) : null,
    projectId: req.query.projectId ? String(req.query.projectId) : null
  });
  res.json({ sessions });
}));

router.post('/v1/chat/sessions', requireUser, asyncHandler(async (req, res) => {
  const session = await createChatSession({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    workspaceId: req.body?.workspaceId,
    environmentId: req.body?.environmentId,
    projectId: req.body?.projectId,
    providerAccountId: req.body?.providerAccountId,
    title: req.body?.title
  });
  res.status(201).json({ session });
}));

router.get('/v1/chat/sessions/:sessionId/messages', requireUser, asyncHandler(async (req, res) => {
  const messages = await listMessages({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    sessionId: req.params.sessionId
  });
  res.json({ messages });
}));

router.get('/v1/chat/sessions/:sessionId/runs', requireUser, asyncHandler(async (req, res) => {
  const runs = await listRuns({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    sessionId: req.params.sessionId
  });
  res.json({ runs });
}));

router.get('/v1/chat/sessions/:sessionId/runs/:runId/events', requireUser, asyncHandler(async (req, res) => {
  const events = await listRunEvents({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    sessionId: req.params.sessionId,
    runId: req.params.runId
  });
  res.json({ events });
}));

router.post('/v1/chat/sessions/:sessionId/runs', requireUser, asyncHandler(async (req, res) => {
  const result = await queueRun({
    tenant: req.context.tenant,
    membership: req.context.membership,
    user: req.context.user,
    sessionId: req.params.sessionId,
    prompt: req.body?.prompt,
    providerAccountId: req.body?.providerAccountId,
    model: req.body?.model
  });
  res.status(202).json(result);
}));

router.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details || null,
      requestId: req.context?.requestId || null
    });
  }

  console.error('[control-plane]', req.context?.requestId, err);
  res.status(500).json({
    error: 'internal_error',
    requestId: req.context?.requestId || null
  });
});

module.exports = { router };
