'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const config = require('./config');
const { requestContext } = require('./context');
const { optionalUser, requireVerifiedUser } = require('./auth');
const { resolveTenant } = require('./tenant');
const { HttpError, badRequest, forbidden, unauthorized } = require('./errors');
const { serializeCookie, clearCookie } = require('./cookies');
const { signUp, signIn, signOut, requestEmailVerification, verifyEmail } = require('./services/auth-service');
const { bootstrapTenant, listUserTenants } = require('./services/tenant-service');
const { listWorkspaces } = require('./services/workspace-service');
const { listEnvironments, createEnvironment, updateEnvironment, queueProjectDiscovery, listDiscoveryRequests } = require('./services/environment-service');
const { listProjects, createProject, updateProject } = require('./services/project-service');
const { getBillingSummary, createCheckoutSession, createPortalSession, processWebhook, getBillingHealth } = require('./services/billing-service');
const { createProviderAccount, listProviderAccounts, listSupportedProviders } = require('./services/provider-account-service');
const { listChatSessions, createChatSession, listMessages, listRuns, listRunEvents, queueRun } = require('./services/chat-service');
const { createEnterpriseEvaluation, listEnterpriseEvaluations, updateEnterpriseEvaluation } = require('./services/enterprise-evaluation-service');
const { listMembers, inviteMember, acceptInvite } = require('./services/member-service');
const { getQueueHealth, retryFailedEmail, requeueRun } = require('./services/ops-service');

const publicRoot = path.join(__dirname, '..', 'public');

function runMiddleware(fn, req, res) {
  return new Promise((resolve, reject) => {
    fn(req, res, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function parseJsonBody(req, rawBody) {
  if (!rawBody.length) return {};
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return {};
  }
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw badRequest('invalid_json', 'request body must be valid JSON');
  }
}

function getMimeType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function safePublicPath(pathname) {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(publicRoot, relativePath);
  if (!fullPath.startsWith(publicRoot)) {
    return null;
  }
  return fullPath;
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  res.end(JSON.stringify(payload));
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

function requireUser(req) {
  if (!req.context.user) {
    throw unauthorized('auth_required', 'authentication required');
  }
}

function assertTenantAdmin(req) {
  requireUser(req);
  if (!req.context.tenant) {
    throw badRequest('tenant_required', 'tenant context required');
  }
}

function parsePathParams(template, pathname) {
  const templateParts = template.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (templateParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < templateParts.length; i += 1) {
    const part = templateParts[i];
    const value = pathParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = value;
      continue;
    }
    if (part !== value) return null;
  }
  return params;
}

async function buildRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.path = url.pathname;
  req.query = Object.fromEntries(url.searchParams.entries());
  req.ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

  await runMiddleware(requestContext, req, res);
  await runMiddleware(optionalUser, req, res);
  await runMiddleware(resolveTenant, req, res);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  req.rawBody = Buffer.concat(chunks);
  req.body = req.path === '/v1/billing/webhook' ? {} : parseJsonBody(req, req.rawBody);
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.path.startsWith('/v1/') || req.path === '/health') return false;

  const filePath = safePublicPath(req.path);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const isHtml = filePath.endsWith('.html');
  res.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': isHtml ? 'no-store, must-revalidate' : 'public, max-age=300'
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function routeRequest(req, res) {
  const pathname = req.path;
  const method = req.method;

  if (method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', service: 'eon-chat-control-plane' });
  }

  if (method === 'POST' && pathname === '/v1/auth/signup') {
    const result = await signUp({
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
      inviteToken: req.body?.inviteToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, result.sessionToken);
    return sendJson(res, 201, {
      user: result.user,
      acceptedInvite: result.acceptedInvite || null,
      emailVerification: result.emailVerification || null
    });
  }

  if (method === 'POST' && pathname === '/v1/auth/signin') {
    const result = await signIn({
      email: req.body?.email,
      password: req.body?.password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, result.sessionToken);
    return sendJson(res, 200, { user: result.user });
  }

  if (method === 'POST' && pathname === '/v1/auth/signout') {
    await signOut(req.context.sessionToken);
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': clearCookie(config.sessionCookieName, { sameSite: 'Lax', path: '/' })
    });
  }

  if (method === 'POST' && pathname === '/v1/auth/request-email-verification') {
    requireUser(req);
    return sendJson(res, 200, await requestEmailVerification({
      user: req.context.user
    }));
  }

  if (method === 'POST' && pathname === '/v1/auth/verify-email') {
    return sendJson(res, 200, await verifyEmail({
      verificationToken: req.body?.verificationToken
    }));
  }

  if (method === 'GET' && pathname === '/v1/context') {
    const tenants = req.context.user ? await listUserTenants(req.context.user.id) : [];
    return sendJson(res, 200, {
      requestId: req.context.requestId,
      tenant: req.context.tenant,
      membership: req.context.membership || null,
      user: req.context.user,
      tenants
    });
  }

  if (method === 'POST' && pathname === '/v1/tenants/bootstrap') {
    requireUser(req);
    requireVerifiedUser(req);
    const result = await bootstrapTenant({
      userId: req.context.user.id,
      tenantName: req.body?.tenantName,
      tenantSlug: req.body?.tenantSlug,
      workspaceName: req.body?.workspaceName,
      planId: req.body?.planId
    });
    return sendJson(res, 201, result);
  }

  if (method === 'GET' && pathname === '/v1/tenants/me') {
    requireUser(req);
    return sendJson(res, 200, { tenants: await listUserTenants(req.context.user.id) });
  }

  if (method === 'GET' && pathname === '/v1/workspaces') {
    requireUser(req);
    return sendJson(res, 200, {
      workspaces: await listWorkspaces({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user
      })
    });
  }

  if (method === 'GET' && pathname === '/v1/environments') {
    requireUser(req);
    return sendJson(res, 200, {
      environments: await listEnvironments({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : ''
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/environments') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 201, {
      environment: await createEnvironment({
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
      })
    });
  }

  const environmentParams = parsePathParams('/v1/environments/:environmentId', pathname);
  if (method === 'PATCH' && environmentParams) {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, {
      environment: await updateEnvironment({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        environmentId: environmentParams.environmentId,
        input: req.body
      })
    });
  }

  const discoveryParams = parsePathParams('/v1/environments/:environmentId/discovery-requests', pathname);
  if (method === 'GET' && discoveryParams) {
    requireUser(req);
    return sendJson(res, 200, {
      requests: await listDiscoveryRequests({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        environmentId: discoveryParams.environmentId
      })
    });
  }

  if (method === 'POST' && discoveryParams) {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 202, await queueProjectDiscovery({
      tenant: req.context.tenant,
      membership: req.context.membership,
      user: req.context.user,
      environmentId: discoveryParams.environmentId,
      strategy: req.body?.strategy,
      request: req.body?.request
    }));
  }

  if (method === 'GET' && pathname === '/v1/projects') {
    requireUser(req);
    return sendJson(res, 200, {
      projects: await listProjects({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : '',
        environmentId: req.query.environmentId ? String(req.query.environmentId) : null
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/projects') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 201, {
      project: await createProject({
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
      })
    });
  }

  const projectParams = parsePathParams('/v1/projects/:projectId', pathname);
  if (method === 'PATCH' && projectParams) {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, {
      project: await updateProject({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        projectId: projectParams.projectId,
        input: req.body
      })
    });
  }

  if (method === 'GET' && pathname === '/v1/members') {
    requireUser(req);
    return sendJson(res, 200, await listMembers({
      tenant: req.context.tenant,
      membership: req.context.membership
    }));
  }

  if (method === 'POST' && pathname === '/v1/members/invites') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 201, {
      invite: await inviteMember({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        input: {
          email: req.body?.email,
          role: req.body?.role
        }
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/members/accept-invite') {
    requireUser(req);
    return sendJson(res, 200, await acceptInvite({
      user: req.context.user,
      inviteToken: req.body?.inviteToken
    }));
  }

  if (method === 'GET' && pathname === '/v1/billing/summary') {
    assertTenantAdmin(req);
    if (!req.context.membership || !['owner', 'admin', 'billing_admin'].includes(req.context.membership.role)) {
      throw forbidden('billing_forbidden', 'billing access requires admin or billing role');
    }
    return sendJson(res, 200, { summary: await getBillingSummary(req.context.tenant.id) });
  }

  if (method === 'GET' && pathname === '/v1/billing/health') {
    requireUser(req);
    return sendJson(res, 200, { health: await getBillingHealth() });
  }

  if (method === 'POST' && pathname === '/v1/billing/checkout') {
    assertTenantAdmin(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, await createCheckoutSession({
      tenant: req.context.tenant,
      membership: req.context.membership,
      successUrl: req.body?.successUrl,
      cancelUrl: req.body?.cancelUrl
    }));
  }

  if (method === 'POST' && pathname === '/v1/billing/portal') {
    assertTenantAdmin(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, await createPortalSession({
      tenant: req.context.tenant,
      membership: req.context.membership,
      returnUrl: req.body?.returnUrl
    }));
  }

  if (method === 'POST' && pathname === '/v1/billing/webhook') {
    return sendJson(res, 200, await processWebhook({
      rawBody: req.rawBody,
      signature: req.headers['stripe-signature']
    }));
  }

  if (method === 'GET' && pathname === '/v1/providers/catalog') {
    requireUser(req);
    return sendJson(res, 200, { providers: await listSupportedProviders() });
  }

  if (method === 'GET' && pathname === '/v1/ops/queue-health') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, {
      health: await getQueueHealth({
        user: req.context.user,
        tenant: req.context.tenant,
        membership: req.context.membership
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/ops/retry-email') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, await retryFailedEmail({
      user: req.context.user,
      tenant: req.context.tenant,
      membership: req.context.membership,
      emailId: req.body?.emailId
    }));
  }

  if (method === 'POST' && pathname === '/v1/ops/requeue-run') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 200, await requeueRun({
      user: req.context.user,
      tenant: req.context.tenant,
      membership: req.context.membership,
      runId: req.body?.runId
    }));
  }

  if (method === 'GET' && pathname === '/v1/provider-accounts') {
    requireUser(req);
    return sendJson(res, 200, {
      accounts: await listProviderAccounts({
        tenant: req.context.tenant,
        membership: req.context.membership,
        workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : null
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/provider-accounts') {
    assertTenantAdmin(req);
    requireVerifiedUser(req);
    return sendJson(res, 201, {
      account: await createProviderAccount({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        provider: req.body?.provider,
        mode: req.body?.mode,
        displayName: req.body?.displayName,
        secret: req.body?.secret,
        config: req.body?.config,
        workspaceId: req.body?.workspaceId
      })
    });
  }

  if (method === 'GET' && pathname === '/v1/chat/sessions') {
    requireUser(req);
    return sendJson(res, 200, {
      sessions: await listChatSessions({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : '',
        environmentId: req.query.environmentId ? String(req.query.environmentId) : null,
        projectId: req.query.projectId ? String(req.query.projectId) : null
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/chat/sessions') {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 201, {
      session: await createChatSession({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        workspaceId: req.body?.workspaceId,
        environmentId: req.body?.environmentId,
        projectId: req.body?.projectId,
        providerAccountId: req.body?.providerAccountId,
        title: req.body?.title
      })
    });
  }

  const messageParams = parsePathParams('/v1/chat/sessions/:sessionId/messages', pathname);
  if (method === 'GET' && messageParams) {
    requireUser(req);
    return sendJson(res, 200, {
      messages: await listMessages({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        sessionId: messageParams.sessionId
      })
    });
  }

  const runsParams = parsePathParams('/v1/chat/sessions/:sessionId/runs', pathname);
  if (method === 'GET' && runsParams) {
    requireUser(req);
    return sendJson(res, 200, {
      runs: await listRuns({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        sessionId: runsParams.sessionId
      })
    });
  }

  if (method === 'POST' && runsParams) {
    requireUser(req);
    requireVerifiedUser(req);
    return sendJson(res, 202, await queueRun({
      tenant: req.context.tenant,
      membership: req.context.membership,
      user: req.context.user,
      sessionId: runsParams.sessionId,
      prompt: req.body?.prompt,
      providerAccountId: req.body?.providerAccountId,
      model: req.body?.model
    }));
  }

  const eventsParams = parsePathParams('/v1/chat/sessions/:sessionId/runs/:runId/events', pathname);
  if (method === 'GET' && eventsParams) {
    requireUser(req);
    return sendJson(res, 200, {
      events: await listRunEvents({
        tenant: req.context.tenant,
        membership: req.context.membership,
        user: req.context.user,
        sessionId: eventsParams.sessionId,
        runId: eventsParams.runId
      })
    });
  }

  if (method === 'POST' && pathname === '/v1/enterprise-evaluations') {
    return sendJson(res, 201, {
      evaluation: await createEnterpriseEvaluation({
        tenant: req.context.tenant,
        user: req.context.user,
        input: {
          name: req.body?.name,
          email: req.body?.email,
          company: req.body?.company,
          useCase: req.body?.useCase,
          estimatedSeats: req.body?.estimatedSeats,
          planId: req.body?.planId,
          source: req.body?.source
        }
      })
    });
  }

  if (method === 'GET' && pathname === '/v1/enterprise-evaluations') {
    requireUser(req);
    return sendJson(res, 200, {
      evaluations: await listEnterpriseEvaluations({
        tenant: req.context.tenant,
        membership: req.context.membership
      })
    });
  }

  const enterpriseEvaluationParams = parsePathParams('/v1/enterprise-evaluations/:evaluationId', pathname);
  if (method === 'PATCH' && enterpriseEvaluationParams) {
    requireUser(req);
    return sendJson(res, 200, {
      evaluation: await updateEnterpriseEvaluation({
        tenant: req.context.tenant,
        membership: req.context.membership,
        evaluationId: enterpriseEvaluationParams.evaluationId,
        input: {
          status: req.body?.status,
          notesText: req.body?.notesText
        }
      })
    });
  }

  throw new HttpError(404, 'not_found', 'route not found');
}

const server = http.createServer(async (req, res) => {
  try {
    await buildRequest(req, res);
    const served = await serveStatic(req, res);
    if (served) return;
    await routeRequest(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(res, error.status, {
        error: error.code,
        message: error.message,
        details: error.details || null,
        requestId: req.context?.requestId || null
      });
    }

    console.error('[control-plane]', req.context?.requestId, error);
    return sendJson(res, 500, {
      error: 'internal_error',
      requestId: req.context?.requestId || null
    });
  }
});

server.listen(config.port, () => {
  console.log(`[control-plane] listening on http://localhost:${config.port}`);
});
