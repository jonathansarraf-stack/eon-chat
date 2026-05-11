const state = {
  context: null,
  selectedTenantSlug: localStorage.getItem('eon_cp_tenant_slug') || '',
  selectedWorkspaceId: '',
  selectedProviderAccountId: '',
  selectedSessionId: '',
  latestRunId: '',
  providersCatalog: [],
  enterpriseEvaluations: []
};

const els = {
  userChip: document.getElementById('user-chip'),
  tenantChip: document.getElementById('tenant-chip'),
  workerChip: document.getElementById('worker-chip'),
  tenantSelect: document.getElementById('tenant-select'),
  workspaceSelect: document.getElementById('workspace-select'),
  providerAccountSelect: document.getElementById('provider-account-select'),
  providerKind: document.getElementById('provider-kind'),
  providerModelSelect: document.getElementById('provider-model-select'),
  providerForm: document.getElementById('provider-form'),
  enterpriseForm: document.getElementById('enterprise-form'),
  enterpriseManageForm: document.getElementById('enterprise-manage-form'),
  enterpriseEvaluationSelect: document.getElementById('enterprise-evaluation-select'),
  enterpriseStatusSelect: document.getElementById('enterprise-status-select'),
  enterpriseNotesInput: document.getElementById('enterprise-notes-input'),
  verificationTokenInput: document.getElementById('verification-token-input'),
  authJson: document.getElementById('auth-json'),
  signupInviteToken: document.getElementById('signup-invite-token'),
  memberInviteForm: document.getElementById('member-invite-form'),
  inviteAcceptForm: document.getElementById('invite-accept-form'),
  inviteTokenInput: document.getElementById('invite-token-input'),
  membersJson: document.getElementById('members-json'),
  opsJson: document.getElementById('ops-json'),
  opsEmailForm: document.getElementById('ops-email-form'),
  opsRunForm: document.getElementById('ops-run-form'),
  sessionList: document.getElementById('session-list'),
  messageList: document.getElementById('message-list'),
  eventsJson: document.getElementById('events-json'),
  contextJson: document.getElementById('context-json'),
  billingJson: document.getElementById('billing-json'),
  enterpriseJson: document.getElementById('enterprise-json'),
  providersJson: document.getElementById('providers-json'),
  chatMeta: document.getElementById('chat-meta'),
  toast: document.getElementById('toast')
};

function showToast(message, isError = false) {
  const normalized = String(message || '');
  const friendly = normalized === 'email verification is required'
    ? 'Verifique seu email antes de continuar.'
    : normalized;
  els.toast.textContent = friendly;
  els.toast.classList.remove('hidden');
  els.toast.style.background = isError ? '#7c2424' : '#161310';
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3000);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function selectedTenantSlug() {
  return state.selectedTenantSlug || '';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (selectedTenantSlug()) {
    headers['x-tenant-slug'] = selectedTenantSlug();
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || 'Request failed');
  }
  return payload;
}

function setTenantSlug(slug) {
  state.selectedTenantSlug = slug || '';
  if (slug) {
    localStorage.setItem('eon_cp_tenant_slug', slug);
  } else {
    localStorage.removeItem('eon_cp_tenant_slug');
  }
}

function renderContext() {
  const user = state.context?.user;
  const tenant = state.context?.tenant;
  els.userChip.textContent = user ? `${user.email}` : 'Signed out';
  els.tenantChip.textContent = tenant ? `Tenant: ${tenant.slug}` : 'No tenant selected';
  els.contextJson.textContent = pretty(state.context || {});
  els.authJson.textContent = pretty({
    user: user || null,
    emailVerified: Boolean(user?.emailVerifiedAt),
    nextStep: user && !user?.emailVerifiedAt ? 'verify_email_required_for_sensitive_actions' : 'ready'
  });
}

function renderTenantOptions() {
  const tenants = state.context?.tenants || [];
  els.tenantSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = tenants.length ? 'Select a tenant' : 'No tenants yet';
  els.tenantSelect.appendChild(placeholder);

  for (const tenant of tenants) {
    const option = document.createElement('option');
    option.value = tenant.slug;
    option.textContent = `${tenant.name} (${tenant.slug})`;
    if (tenant.slug === state.selectedTenantSlug) option.selected = true;
    els.tenantSelect.appendChild(option);
  }
}

function renderWorkspaces(workspaces) {
  els.workspaceSelect.innerHTML = '';
  for (const workspace of workspaces) {
    const option = document.createElement('option');
    option.value = workspace.id;
    option.textContent = workspace.name;
    if (!state.selectedWorkspaceId) state.selectedWorkspaceId = workspace.id;
    if (workspace.id === state.selectedWorkspaceId) option.selected = true;
    els.workspaceSelect.appendChild(option);
  }
}

function renderProviderAccounts(accounts) {
  els.providerAccountSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = accounts.length ? 'Select provider account' : 'No provider account';
  els.providerAccountSelect.appendChild(placeholder);

  for (const account of accounts) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.displayName} (${account.provider})`;
    if (!state.selectedProviderAccountId) state.selectedProviderAccountId = account.id;
    if (account.id === state.selectedProviderAccountId) option.selected = true;
    els.providerAccountSelect.appendChild(option);
  }

  els.providersJson.textContent = pretty(accounts);
}

function renderEnterpriseEvaluationOptions() {
  if (!els.enterpriseEvaluationSelect) return;

  const previousValue = els.enterpriseEvaluationSelect.value;
  els.enterpriseEvaluationSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.enterpriseEvaluations.length ? 'Select an evaluation' : 'No evaluations yet';
  els.enterpriseEvaluationSelect.appendChild(placeholder);

  for (const evaluation of state.enterpriseEvaluations) {
    const option = document.createElement('option');
    option.value = evaluation.id;
    option.textContent = `${evaluation.company} · ${evaluation.name} · ${evaluation.status}`;
    if (evaluation.id === previousValue) option.selected = true;
    els.enterpriseEvaluationSelect.appendChild(option);
  }

  hydrateEnterpriseManageForm();
}

function hydrateEnterpriseManageForm() {
  if (!els.enterpriseEvaluationSelect || !els.enterpriseStatusSelect || !els.enterpriseNotesInput) return;
  const selected = state.enterpriseEvaluations.find((item) => item.id === els.enterpriseEvaluationSelect.value);
  if (!selected) {
    els.enterpriseStatusSelect.value = '';
    els.enterpriseNotesInput.value = '';
    return;
  }
  els.enterpriseStatusSelect.value = selected.status || '';
  els.enterpriseNotesInput.value = selected.notes?.salesNotes || '';
}

function renderProviderModels() {
  const provider = els.providerKind.value;
  const entry = state.providersCatalog.find((item) => item.id === provider);
  els.providerModelSelect.innerHTML = '';

  for (const model of entry?.models || []) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    els.providerModelSelect.appendChild(option);
  }
}

function syncProviderSecretRequirement() {
  const secretInput = els.providerForm.querySelector('input[name="secret"]');
  const modeInput = els.providerForm.querySelector('select[name="mode"]');
  const requiresSecret = modeInput.value === 'byok';
  secretInput.required = requiresSecret;
  secretInput.placeholder = requiresSecret ? 'API key / token' : 'Optional when platform managed';
}

function renderSessions(sessions) {
  els.sessionList.innerHTML = '';
  if (!sessions.length) {
    els.sessionList.innerHTML = '<div class="subtle">No sessions yet.</div>';
    return;
  }

  for (const session of sessions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `list-item${session.id === state.selectedSessionId ? ' active' : ''}`;
    button.innerHTML = `
      <div class="list-item-title">${session.title}</div>
      <div class="subtle">${session.status} · ${session.provider_account_id || 'no provider selected'}</div>
    `;
    button.addEventListener('click', async () => {
      state.selectedSessionId = session.id;
      await refreshSessionDetail();
      await refreshSessions();
    });
    els.sessionList.appendChild(button);
  }
}

function renderMessages(messages) {
  els.messageList.innerHTML = '';
  for (const message of messages) {
    const div = document.createElement('div');
    div.className = `message-bubble ${message.role}`;
    div.textContent = message.content_json?.text || pretty(message.content_json);
    els.messageList.appendChild(div);
  }
}

async function refreshContext() {
  state.context = await api('/v1/context', { method: 'GET' });
  const tenants = state.context?.tenants || [];
  if (!state.selectedTenantSlug && tenants.length) {
    setTenantSlug(tenants[0].slug);
  }
  renderContext();
  renderTenantOptions();
}

async function refreshBilling() {
  if (!state.context?.user || !selectedTenantSlug()) {
    els.billingJson.textContent = pretty({ note: 'select a tenant first' });
    els.enterpriseJson.textContent = pretty({ note: 'select a tenant first' });
    state.enterpriseEvaluations = [];
    renderEnterpriseEvaluationOptions();
    return;
  }

  const [summary, health, evaluations] = await Promise.all([
    api('/v1/billing/summary'),
    api('/v1/billing/health'),
    api('/v1/enterprise-evaluations').catch((error) => ({ error: error.message }))
  ]);

  els.billingJson.textContent = pretty({
    summary: summary.summary,
    health: health.health
  });
  state.enterpriseEvaluations = evaluations.evaluations || [];
  els.enterpriseJson.textContent = pretty(state.enterpriseEvaluations.length ? state.enterpriseEvaluations : evaluations);
  renderEnterpriseEvaluationOptions();
}

async function refreshProviders() {
  if (!state.context?.user || !selectedTenantSlug() || !state.selectedWorkspaceId) {
    els.providersJson.textContent = pretty({ note: 'sign in and select a tenant + workspace' });
    return;
  }

  const [catalog, accounts] = await Promise.all([
    api('/v1/providers/catalog'),
    api(`/v1/provider-accounts?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`)
  ]);

  state.providersCatalog = catalog.providers || [];
  renderProviderModels();
  renderProviderAccounts(accounts.accounts || []);
}

async function refreshMembers() {
  if (!state.context?.user || !selectedTenantSlug()) {
    els.membersJson.textContent = pretty({ note: 'sign in and select a tenant' });
    return;
  }
  const payload = await api('/v1/members').catch((error) => ({ error: error.message }));
  els.membersJson.textContent = pretty(payload);
}

async function refreshOps() {
  if (!state.context?.user) {
    els.opsJson.textContent = pretty({ note: 'sign in to load ops health' });
    return;
  }
  const payload = await api('/v1/ops/queue-health').catch((error) => ({ error: error.message }));
  els.opsJson.textContent = pretty(payload);
}

async function refreshWorkspaces() {
  if (!state.context?.user || !selectedTenantSlug()) {
    els.workspaceSelect.innerHTML = '';
    return;
  }
  const payload = await api('/v1/workspaces');
  const workspaces = payload.workspaces || [];
  if (workspaces.length && !workspaces.some((item) => item.id === state.selectedWorkspaceId)) {
    state.selectedWorkspaceId = workspaces[0].id;
  }
  renderWorkspaces(workspaces);
}

async function refreshSessions() {
  if (!state.context?.user || !selectedTenantSlug() || !state.selectedWorkspaceId) {
    els.sessionList.innerHTML = '<div class="subtle">Sign in to load sessions.</div>';
    return;
  }
  const payload = await api(`/v1/chat/sessions?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  const sessions = payload.sessions || [];
  if (!sessions.length) {
    state.selectedSessionId = '';
  } else if (!sessions.some((item) => item.id === state.selectedSessionId)) {
    state.selectedSessionId = sessions[0].id;
  }
  renderSessions(sessions);
}

async function refreshSessionDetail() {
  if (!state.context?.user || !state.selectedSessionId) {
    els.messageList.innerHTML = '<div class="subtle">Select a session to see messages.</div>';
    els.eventsJson.textContent = pretty({});
    return;
  }

  const [messagesPayload, runsPayload] = await Promise.all([
    api(`/v1/chat/sessions/${state.selectedSessionId}/messages`),
    api(`/v1/chat/sessions/${state.selectedSessionId}/runs`)
  ]);

  const messages = messagesPayload.messages || [];
  const runs = runsPayload.runs || [];
  renderMessages(messages);
  els.chatMeta.textContent = `${messages.length} messages · ${runs.length} runs`;

  if (runs.length) {
    state.latestRunId = runs[0].id;
    const events = await api(`/v1/chat/sessions/${state.selectedSessionId}/runs/${state.latestRunId}/events`);
    els.eventsJson.textContent = pretty({
      latestRun: runs[0],
      events: events.events
    });
  } else {
    els.eventsJson.textContent = pretty({ note: 'no runs yet' });
  }
}

async function refreshDashboard() {
  await refreshContext();
  if (!state.context?.user || !selectedTenantSlug()) {
    els.billingJson.textContent = pretty({ note: 'sign in to load billing' });
    els.providersJson.textContent = pretty({ note: 'sign in to load providers' });
    els.membersJson.textContent = pretty({ note: 'sign in to load members' });
    els.opsJson.textContent = pretty({ note: 'sign in and verify email to load ops health' });
    return;
  }
  await refreshWorkspaces();
  await refreshProviders();
  await refreshMembers();
  await refreshOps();
  await refreshSessions();
  await refreshSessionDetail();
  await refreshBilling();
  prefillInviteTokenFromUrl();
}

async function openBillingUrl(path) {
  const payload = await api(path, {
    method: 'POST',
    body: JSON.stringify({})
  });
  if (payload.url) {
    window.open(payload.url, '_blank', 'noopener,noreferrer');
  }
}

function prefillEnterpriseForm() {
  const user = state.context?.user;
  const tenant = state.context?.tenant;
  if (!els.enterpriseForm) return;
  if (user?.name) els.enterpriseForm.elements.name.value = user.name;
  if (user?.email) els.enterpriseForm.elements.email.value = user.email;
  if (tenant?.name) els.enterpriseForm.elements.company.value = tenant.name;
}

function prefillInviteTokenFromUrl() {
  if (!els.inviteTokenInput && !els.signupInviteToken) return;
  const url = new URL(window.location.href);
  const inviteToken = url.searchParams.get('invite');
  const verifyToken = url.searchParams.get('verify');
  if (inviteToken) {
    if (els.inviteTokenInput) els.inviteTokenInput.value = inviteToken;
    if (els.signupInviteToken) els.signupInviteToken.value = inviteToken;
  }
  if (verifyToken && els.verificationTokenInput) {
    els.verificationTokenInput.value = verifyToken;
  }
}

document.getElementById('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    if (payload.acceptedInvite?.tenantId) {
      showToast('Account created and invite accepted');
    } else if (payload.emailVerification?.verifyUrl) {
      showToast('Account created, verification queued');
    } else {
      showToast('Account created');
    }
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('signin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    showToast('Signed in');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('verify-email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({
        verificationToken: form.get('verificationToken')
      })
    });
    showToast('Email verified');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  try {
    await api('/v1/auth/signout', { method: 'POST', body: JSON.stringify({}) });
    state.context = null;
    state.selectedSessionId = '';
    showToast('Signed out');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('tenant-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/tenants/bootstrap', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    setTenantSlug(payload.tenant.slug);
    showToast('Tenant created');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/provider-accounts', {
      method: 'POST',
      body: JSON.stringify({
        provider: form.get('provider'),
        mode: form.get('mode'),
        displayName: form.get('displayName'),
        secret: form.get('secret'),
        workspaceId: state.selectedWorkspaceId,
        config: {
          defaultModel: form.get('defaultModel')
        }
      })
    });
    event.currentTarget.reset();
    renderProviderModels();
    showToast('Provider account saved');
    await refreshProviders();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('member-invite-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/members/invites', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        role: form.get('role')
      })
    });
    showToast('Invite created');
    event.currentTarget.reset();
    els.membersJson.textContent = pretty(payload);
    if (payload.invite?.inviteToken) {
      els.inviteTokenInput.value = payload.invite.inviteToken;
    }
    await refreshMembers();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('invite-accept-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/members/accept-invite', {
      method: 'POST',
      body: JSON.stringify({
        inviteToken: form.get('inviteToken')
      })
    });
    showToast('Invite accepted');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('ops-email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/ops/retry-email', {
      method: 'POST',
      body: JSON.stringify({
        emailId: form.get('emailId')
      })
    });
    els.opsJson.textContent = pretty(payload);
    showToast('Email retry queued');
    await refreshOps();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('ops-run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/ops/requeue-run', {
      method: 'POST',
      body: JSON.stringify({
        runId: form.get('runId')
      })
    });
    els.opsJson.textContent = pretty(payload);
    showToast('Run requeued');
    await refreshOps();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('enterprise-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/enterprise-evaluations', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        company: form.get('company'),
        estimatedSeats: form.get('estimatedSeats'),
        useCase: form.get('useCase'),
        planId: 'enterprise',
        source: 'control_plane_ui'
      })
    });
    showToast('Enterprise evaluation requested');
    event.currentTarget.reset();
    prefillEnterpriseForm();
    await refreshBilling();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('enterprise-manage-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const evaluationId = form.get('evaluationId');
  try {
    await api(`/v1/enterprise-evaluations/${encodeURIComponent(evaluationId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: form.get('status'),
        notesText: form.get('notesText')
      })
    });
    showToast('Enterprise evaluation updated');
    await refreshBilling();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('session-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        providerAccountId: state.selectedProviderAccountId || null,
        title: form.get('title')
      })
    });
    event.currentTarget.reset();
    showToast('Session created');
    await refreshSessions();
    await refreshSessionDetail();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('prompt-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api(`/v1/chat/sessions/${state.selectedSessionId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: form.get('prompt'),
        providerAccountId: state.selectedProviderAccountId || null
      })
    });
    event.currentTarget.reset();
    showToast('Run queued');
    await refreshSessionDetail();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.tenantSelect.addEventListener('change', async (event) => {
  setTenantSlug(event.target.value);
  state.selectedWorkspaceId = '';
  state.selectedProviderAccountId = '';
  state.selectedSessionId = '';
  await refreshDashboard();
});

els.workspaceSelect.addEventListener('change', async (event) => {
  state.selectedWorkspaceId = event.target.value;
  state.selectedProviderAccountId = '';
  state.selectedSessionId = '';
  await refreshProviders();
  await refreshSessions();
  await refreshSessionDetail();
});

els.providerAccountSelect.addEventListener('change', (event) => {
  state.selectedProviderAccountId = event.target.value;
});

els.enterpriseEvaluationSelect.addEventListener('change', hydrateEnterpriseManageForm);

els.providerKind.addEventListener('change', renderProviderModels);
els.providerForm.querySelector('select[name="mode"]').addEventListener('change', syncProviderSecretRequirement);

document.getElementById('refresh-context-btn').addEventListener('click', refreshDashboard);
document.getElementById('request-verification-btn').addEventListener('click', async () => {
  try {
    const payload = await api('/v1/auth/request-email-verification', {
      method: 'POST',
      body: JSON.stringify({})
    });
    els.authJson.textContent = pretty(payload);
    showToast(payload.alreadyVerified ? 'Email already verified' : 'Verification re-queued');
  } catch (error) {
    showToast(error.message, true);
  }
});
document.getElementById('billing-refresh-btn').addEventListener('click', refreshBilling);
document.getElementById('providers-refresh-btn').addEventListener('click', refreshProviders);
document.getElementById('members-refresh-btn').addEventListener('click', refreshMembers);
document.getElementById('ops-refresh-btn').addEventListener('click', refreshOps);
document.getElementById('sessions-refresh-btn').addEventListener('click', async () => {
  await refreshSessions();
  await refreshSessionDetail();
});
document.getElementById('checkout-btn').addEventListener('click', async () => {
  try {
    await openBillingUrl('/v1/billing/checkout');
  } catch (error) {
    showToast(
      error.message === 'enterprise uses custom evaluation and cannot be purchased through self-serve checkout'
        ? 'Enterprise fica em avaliação personalizada.'
        : error.message,
      true
    );
  }
});
document.getElementById('portal-btn').addEventListener('click', async () => {
  try {
    await openBillingUrl('/v1/billing/portal');
  } catch (error) {
    showToast(error.message, true);
  }
});

async function bootstrap() {
  try {
    await refreshDashboard();
    els.workerChip.textContent = 'Worker is required: run npm run worker';
    syncProviderSecretRequirement();
    prefillEnterpriseForm();
    prefillInviteTokenFromUrl();
  } catch (error) {
    els.contextJson.textContent = pretty({ startupError: error.message });
  }
}

bootstrap();
