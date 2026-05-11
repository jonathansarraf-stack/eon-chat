'use strict';

const storage = {
  tenantSlug: 'eon_mt_tenant_slug',
  workspaceId: 'eon_mt_workspace_id',
  environmentId: 'eon_mt_environment_id',
  projectId: 'eon_mt_project_id',
  providerAccountId: 'eon_mt_provider_account_id',
  model: 'eon_mt_model'
};

const projectPalette = ['#c5ff3d', '#00f0ff', '#ff8a5b', '#7b7cff', '#8af58c', '#ff5fd2', '#ffd166'];

const state = {
  context: null,
  workspaces: [],
  environments: [],
  projects: [],
  sessions: [],
  providerCatalog: [],
  providerAccounts: [],
  discoveryRequests: [],
  billing: null,
  sessionMessages: [],
  sessionRuns: [],
  sessionEvents: [],
  latestRun: null,
  openTabs: [],
  activeScreen: 'login',
  activePanel: 'projects',
  pollingTimer: null,
  selectedConversationProjectId: '',
  selectedTenantSlug: localStorage.getItem(storage.tenantSlug) || '',
  selectedWorkspaceId: localStorage.getItem(storage.workspaceId) || '',
  selectedEnvironmentId: localStorage.getItem(storage.environmentId) || '',
  selectedProjectId: localStorage.getItem(storage.projectId) || '',
  selectedProviderAccountId: localStorage.getItem(storage.providerAccountId) || '',
  selectedModel: localStorage.getItem(storage.model) || '',
  selectedSessionId: ''
};

const els = {
  toast: document.getElementById('toast'),
  loginScreen: document.getElementById('login-screen'),
  homeScreen: document.getElementById('home-screen'),
  appScreen: document.getElementById('app-screen'),
  authJson: document.getElementById('auth-json'),
  signinForm: document.getElementById('signin-form'),
  signupForm: document.getElementById('signup-form'),
  verifyEmailForm: document.getElementById('verify-email-form'),
  inviteAcceptForm: document.getElementById('invite-accept-form'),
  signupInviteToken: document.getElementById('signup-invite-token'),
  verificationTokenInput: document.getElementById('verification-token-input'),
  inviteTokenInput: document.getElementById('invite-token-input'),
  requestVerificationBtn: document.getElementById('request-verification-btn'),
  loginError: document.getElementById('login-error'),
  tenantSelect: document.getElementById('tenant-select'),
  workspaceSelect: document.getElementById('workspace-select'),
  environmentSelect: document.getElementById('environment-select'),
  refreshBtn: document.getElementById('refresh-btn'),
  homeUserChip: document.getElementById('home-user-chip'),
  signoutBtn: document.getElementById('signout-btn'),
  contextLine: document.getElementById('context-line'),
  verificationBanner: document.getElementById('verification-banner'),
  bannerVerificationBtn: document.getElementById('banner-verification-btn'),
  onboardingCard: document.getElementById('onboarding-card'),
  tenantForm: document.getElementById('tenant-form'),
  homeTabs: Array.from(document.querySelectorAll('.home-tab')),
  homePanels: {
    projects: document.getElementById('panel-projects'),
    conversations: document.getElementById('panel-conversations'),
    activities: document.getElementById('panel-activities')
  },
  toggleEnvironmentFormBtn: document.getElementById('toggle-environment-form-btn'),
  toggleProjectFormBtn: document.getElementById('toggle-project-form-btn'),
  toggleDiscoveryFormBtn: document.getElementById('toggle-discovery-form-btn'),
  environmentForm: document.getElementById('environment-form'),
  projectForm: document.getElementById('project-form'),
  discoveryForm: document.getElementById('discovery-form'),
  quickAccess: document.getElementById('quick-access'),
  projectSearch: document.getElementById('project-search'),
  projectsContainer: document.getElementById('projects-container'),
  providerAccountSelect: document.getElementById('provider-account-select'),
  modelSelect: document.getElementById('model-select'),
  createSessionBtn: document.getElementById('create-session-btn'),
  convProjectTabs: document.getElementById('conv-project-tabs'),
  convSessionsList: document.getElementById('conv-sessions-list'),
  contextJson: document.getElementById('context-json'),
  billingJson: document.getElementById('billing-json'),
  toggleProviderFormBtn: document.getElementById('toggle-provider-form-btn'),
  providerForm: document.getElementById('provider-form'),
  providerKind: document.getElementById('provider-kind'),
  providerModelSelect: document.getElementById('provider-model-select'),
  providersJson: document.getElementById('providers-json'),
  discoveryJson: document.getElementById('discovery-json'),
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
  sidebarMenuBtn: document.getElementById('sidebar-menu-btn'),
  createSessionBtnSidebar: document.getElementById('create-session-btn-sidebar'),
  sessionList: document.getElementById('session-list'),
  userEmail: document.getElementById('user-email'),
  signoutBtnSidebar: document.getElementById('signout-btn-sidebar'),
  goHomeBtn: document.getElementById('go-home-btn'),
  currentTitle: document.getElementById('current-title'),
  chatProviderAccountSelect: document.getElementById('chat-provider-account-select'),
  chatModelSelect: document.getElementById('chat-model-select'),
  providerCostChip: document.getElementById('provider-cost-chip'),
  currentProjectBadge: document.getElementById('current-project-badge'),
  queueChip: document.getElementById('queue-chip'),
  queueChipText: document.getElementById('queue-chip-text'),
  sessionCountBtn: document.getElementById('session-count-btn'),
  projectTabs: document.getElementById('project-tabs'),
  main: document.getElementById('main'),
  promptForm: document.getElementById('prompt-form'),
  msgInput: document.getElementById('msg-input'),
  eventsJson: document.getElementById('events-json')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function formatDate(value) {
  if (!value) return 'agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'agora';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function relativeDate(value) {
  if (!value) return 'sem atividade';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sem atividade';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d`;
}

function colorForSeed(seed) {
  const text = String(seed || 'eon');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return projectPalette[Math.abs(hash) % projectPalette.length];
}

function showToast(message, isError = false) {
  if (!els.toast) return;
  els.toast.textContent = String(message || '');
  els.toast.classList.remove('hidden');
  els.toast.classList.toggle('error', Boolean(isError));
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.add('hidden');
    els.toast.classList.remove('error');
  }, 3200);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.selectedTenantSlug) {
    headers['x-tenant-slug'] = state.selectedTenantSlug;
  }
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = text ? { message: text } : {};
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function currentUser() {
  return state.context?.user || null;
}

function currentTenant() {
  return state.context?.tenant || null;
}

function currentMembership() {
  return state.context?.membership || null;
}

function currentWorkspace() {
  return state.workspaces.find((item) => item.id === state.selectedWorkspaceId) || null;
}

function currentEnvironment() {
  return state.environments.find((item) => item.id === state.selectedEnvironmentId) || null;
}

function currentProject() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function currentSession() {
  return state.sessions.find((item) => item.id === state.selectedSessionId) || null;
}

function currentProviderAccount() {
  return state.providerAccounts.find((item) => item.id === state.selectedProviderAccountId) || null;
}

function currentProviderEntry() {
  const providerId = currentProviderAccount()?.provider;
  return state.providerCatalog.find((item) => item.id === providerId) || null;
}

function isVerified() {
  return Boolean(currentUser()?.emailVerifiedAt);
}

function userCanEdit() {
  const role = currentMembership()?.role;
  return ['owner', 'admin', 'developer', 'billing_admin'].includes(role);
}

function userCanManageProviders() {
  const role = currentMembership()?.role;
  return ['owner', 'admin', 'billing_admin'].includes(role);
}

function setTenantSlug(value) {
  state.selectedTenantSlug = value || '';
  if (value) localStorage.setItem(storage.tenantSlug, value);
  else localStorage.removeItem(storage.tenantSlug);
}

function setWorkspaceId(value) {
  state.selectedWorkspaceId = value || '';
  if (value) localStorage.setItem(storage.workspaceId, value);
  else localStorage.removeItem(storage.workspaceId);
}

function setEnvironmentId(value) {
  state.selectedEnvironmentId = value || '';
  if (value) localStorage.setItem(storage.environmentId, value);
  else localStorage.removeItem(storage.environmentId);
}

function setProjectId(value) {
  state.selectedProjectId = value || '';
  if (value) localStorage.setItem(storage.projectId, value);
  else localStorage.removeItem(storage.projectId);
}

function setProviderAccountId(value) {
  state.selectedProviderAccountId = value || '';
  if (value) localStorage.setItem(storage.providerAccountId, value);
  else localStorage.removeItem(storage.providerAccountId);
}

function setModel(value) {
  state.selectedModel = value || '';
  if (value) localStorage.setItem(storage.model, value);
  else localStorage.removeItem(storage.model);
}

function clearSessionState() {
  state.selectedSessionId = '';
  state.sessionMessages = [];
  state.sessionRuns = [];
  state.sessionEvents = [];
  state.latestRun = null;
  stopPolling();
}

function stopPolling() {
  if (state.pollingTimer) {
    clearTimeout(state.pollingTimer);
    state.pollingTimer = null;
  }
}

function schedulePolling() {
  stopPolling();
  if (state.activeScreen !== 'app' || !state.selectedSessionId || !state.latestRun) {
    return;
  }
  if (!['queued', 'running'].includes(state.latestRun.status)) {
    return;
  }
  state.pollingTimer = window.setTimeout(async () => {
    try {
      await refreshSessionDetail();
      renderAll();
    } catch (error) {
      showToast(error.message, true);
    }
  }, 3500);
}

function setScreen(screen) {
  state.activeScreen = screen;
  els.loginScreen.classList.toggle('active', screen === 'login');
  els.homeScreen.classList.toggle('active', screen === 'home');
  els.appScreen.classList.toggle('active', screen === 'app');
  if (screen !== 'app') {
    closeSidebar();
    stopPolling();
  }
}

function setPanel(panel) {
  state.activePanel = panel;
  els.homeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === panel);
  });
  Object.entries(els.homePanels).forEach(([name, panelEl]) => {
    panelEl.classList.toggle('active', name === panel);
  });
}

function openSidebar() {
  els.sidebar.classList.add('open');
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
}

function fillSelect(select, items, value, placeholder, getValue, getLabel) {
  if (!select) return;
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = getValue(item);
    option.textContent = getLabel(item);
    if (option.value === value) option.selected = true;
    select.appendChild(option);
  });
}

function modelsForProviderAccount(account) {
  if (!account) return [];
  return currentProviderEntry()?.models || [];
}

function syncModelSelection() {
  const account = currentProviderAccount();
  const models = modelsForProviderAccount(account);
  const defaultModel = account?.config?.defaultModel || '';
  const availableIds = models.map((item) => item.id);
  if (!availableIds.length) {
    setModel('');
    return [];
  }
  if (!availableIds.includes(state.selectedModel)) {
    setModel(availableIds.includes(defaultModel) ? defaultModel : availableIds[0]);
  }
  return models;
}

function providerLabel(account) {
  if (!account) return 'Sem provider';
  return account.displayName || account.provider || 'Provider';
}

function consumptionForSelection(account, modelId) {
  const providerName = account?.provider || '';
  const text = `${providerName} ${modelId || ''}`.toLowerCase();
  if (text.includes('mini') || text.includes('haiku')) {
    return { label: 'Baixo', css: 'low' };
  }
  if (text.includes('opus') || text.includes('gpt-5.3') || text.includes('gpt-5-codex')) {
    return { label: 'Alto', css: 'high' };
  }
  return { label: 'Médio', css: 'medium' };
}

function sessionMeta(session) {
  const account = state.providerAccounts.find((item) => item.id === session.provider_account_id);
  const lastRun = state.selectedSessionId === session.id ? state.latestRun : null;
  const providerText = providerLabel(account);
  const modelText = lastRun?.model || account?.config?.defaultModel || 'modelo padrão';
  return `${providerText} · ${modelText} · ${formatDate(session.updated_at)}`;
}

function messagesCountForProject(projectId) {
  return state.sessions.filter((session) => session.project_id === projectId).length;
}

function lastActivityForProject(projectId) {
  const matches = state.sessions.filter((session) => session.project_id === projectId);
  if (!matches.length) {
    return state.projects.find((project) => project.id === projectId)?.updated_at || null;
  }
  return matches
    .map((session) => session.updated_at)
    .sort((left, right) => new Date(right) - new Date(left))[0];
}

function selectedProjectSessions() {
  if (!state.selectedProjectId) return [];
  return state.sessions.filter((session) => session.project_id === state.selectedProjectId);
}

function ensureTab(project) {
  if (!project) return;
  if (!state.openTabs.some((item) => item.id === project.id)) {
    state.openTabs.push({
      id: project.id,
      name: project.name,
      color: colorForSeed(project.slug || project.id)
    });
  }
}

function pruneTabs() {
  state.openTabs = state.openTabs.filter((tab) => state.projects.some((project) => project.id === tab.id));
}

function renderAuthState() {
  if (!els.authJson) return;
  els.authJson.textContent = pretty({
    user: currentUser(),
    tenant: currentTenant(),
    membership: currentMembership(),
    selectedWorkspaceId: state.selectedWorkspaceId,
    selectedEnvironmentId: state.selectedEnvironmentId,
    selectedProjectId: state.selectedProjectId
  });
}

function renderTopSelectors() {
  const tenants = state.context?.tenants || [];
  fillSelect(
    els.tenantSelect,
    tenants,
    state.selectedTenantSlug,
    tenants.length ? 'Selecione um tenant' : 'Sem tenants',
    (item) => item.slug,
    (item) => item.name
  );
  fillSelect(
    els.workspaceSelect,
    state.workspaces,
    state.selectedWorkspaceId,
    state.workspaces.length ? 'Selecione um workspace' : 'Sem workspaces',
    (item) => item.id,
    (item) => item.name
  );
  fillSelect(
    els.environmentSelect,
    state.environments,
    state.selectedEnvironmentId,
    state.environments.length ? 'Selecione um environment' : 'Sem environments',
    (item) => item.id,
    (item) => item.name
  );
}

function renderHomeHeader() {
  const user = currentUser();
  const membership = currentMembership();
  els.homeUserChip.textContent = user ? (user.name || user.email?.split('@')[0] || 'Conta') : '—';
  els.userEmail.textContent = user?.email || '—';
  els.sessionCountBtn.textContent = String(state.sessions.length || 0);
  els.sessionCountBtn.title = `${state.sessions.length || 0} conversa(s) no environment atual`;

  const bits = [];
  if (currentTenant()) bits.push(currentTenant().name);
  if (currentWorkspace()) bits.push(currentWorkspace().name);
  if (currentEnvironment()) bits.push(currentEnvironment().name);
  if (membership?.role) bits.push(`papel ${membership.role}`);
  els.contextLine.textContent = bits.length
    ? bits.join(' · ')
    : 'Crie ou selecione um tenant para começar.';

  const showVerification = Boolean(user) && !isVerified();
  els.verificationBanner.classList.toggle('hidden', !showVerification);
  els.onboardingCard.classList.toggle('hidden', Boolean((state.context?.tenants || []).length));
}

function renderQuickAccess() {
  els.quickAccess.innerHTML = '';
  const recentProjects = state.projects
    .map((project) => ({
      project,
      lastActivity: lastActivityForProject(project.id),
      sessionCount: messagesCountForProject(project.id)
    }))
    .filter((entry) => entry.sessionCount > 0 || entry.lastActivity)
    .sort((left, right) => new Date(right.lastActivity || 0) - new Date(left.lastActivity || 0))
    .slice(0, 8);

  if (!recentProjects.length) return;

  const label = document.createElement('div');
  label.className = 'quick-access-label';
  label.textContent = 'Acesso rápido';
  els.quickAccess.appendChild(label);

  const list = document.createElement('div');
  list.className = 'quick-access-list';

  recentProjects.forEach(({ project, lastActivity, sessionCount }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-chip';
    chip.innerHTML = `
      <span class="qc-dot" style="background:${escapeHtml(colorForSeed(project.slug || project.id))}"></span>
      <div class="qc-info">
        <span class="qc-name">${escapeHtml(project.name)}</span>
        <span class="qc-meta"><span>${sessionCount} conv.</span><span>${escapeHtml(relativeDate(lastActivity))}</span></span>
      </div>
    `;
    chip.addEventListener('click', async () => {
      await openProject(project.id, true);
    });
    list.appendChild(chip);
  });

  els.quickAccess.appendChild(list);
}

function buildProjectCard(project) {
  const card = document.createElement('div');
  const isActive = project.id === state.selectedProjectId;
  card.className = `project-card${isActive ? ' active' : ''}`;
  const sessionCount = messagesCountForProject(project.id);
  const lastActivity = lastActivityForProject(project.id);
  const env = state.environments.find((item) => item.id === project.environment_id);
  const description = project.metadata_json?.description
    || `${project.source || 'manual'} · ${project.status || 'active'}${env ? ` · ${env.name}` : ''}`;

  card.innerHTML = `
    <div class="p-dot" style="background:${escapeHtml(colorForSeed(project.slug || project.id))}"></div>
    <div class="p-name">${escapeHtml(project.name)}</div>
    <div class="p-desc">${escapeHtml(description)}</div>
    <div class="p-path">${escapeHtml(project.root_path || 'Sem caminho configurado')}</div>
    <button class="p-open" type="button">Abrir chat</button>
    <div class="p-meta">
      <span>${sessionCount} conversa${sessionCount === 1 ? '' : 's'}</span>
      <span>${escapeHtml(relativeDate(lastActivity || project.updated_at))}</span>
    </div>
  `;

  card.addEventListener('click', async (event) => {
    if (event.target.closest('.p-open')) return;
    await openProject(project.id, true);
  });
  card.querySelector('.p-open').addEventListener('click', async (event) => {
    event.stopPropagation();
    await openProject(project.id, true);
  });
  return card;
}

function renderProjectsGrid() {
  els.projectsContainer.innerHTML = '';

  if (!currentUser()) {
    els.projectsContainer.innerHTML = '<div class="home-empty">Entre para ver seus projetos.</div>';
    return;
  }

  if (!state.selectedWorkspaceId) {
    els.projectsContainer.innerHTML = '<div class="home-empty">Selecione um workspace para começar.</div>';
    return;
  }

  if (!state.selectedEnvironmentId) {
    els.projectsContainer.innerHTML = '<div class="home-empty">Crie ou selecione um environment do seu tenant.</div>';
    return;
  }

  const query = (els.projectSearch.value || '').trim().toLowerCase();
  const projects = state.projects.filter((project) => {
    if (!query) return true;
    return [
      project.name,
      project.slug,
      project.root_path,
      project.source,
      project.status
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const grid = document.createElement('div');
  grid.className = 'projects-grid';

  const newCard = document.createElement('button');
  newCard.type = 'button';
  newCard.className = 'project-card new-card';
  newCard.innerHTML = '<div class="plus">+</div><div>Novo projeto</div>';
  newCard.addEventListener('click', () => {
    if (!userCanEdit()) {
      showToast('Seu papel atual não pode criar projetos.', true);
      return;
    }
    els.projectForm.classList.toggle('hidden');
  });
  grid.appendChild(newCard);

  if (!projects.length) {
    const empty = document.createElement('div');
    empty.className = 'home-empty';
    empty.textContent = query
      ? 'Nenhum projeto encontrado para esse filtro.'
      : 'Nenhum projeto ainda. Crie o primeiro dentro do environment selecionado.';
    grid.appendChild(empty);
  } else {
    projects.forEach((project) => grid.appendChild(buildProjectCard(project)));
  }

  els.projectsContainer.appendChild(grid);
}

function renderConversationTabs() {
  els.convProjectTabs.innerHTML = '';
  const byProject = new Map();
  const noProject = [];
  state.sessions.forEach((session) => {
    if (session.project_id) {
      if (!byProject.has(session.project_id)) byProject.set(session.project_id, []);
      byProject.get(session.project_id).push(session);
    } else {
      noProject.push(session);
    }
  });

  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = `conv-ptab${state.selectedConversationProjectId ? '' : ' active'}`;
  allTab.innerHTML = `Todas <span class="ptab-count">${state.sessions.length}</span>`;
  allTab.addEventListener('click', () => {
    state.selectedConversationProjectId = '';
    renderConversationPanel();
  });
  els.convProjectTabs.appendChild(allTab);

  state.projects.forEach((project) => {
    const matches = byProject.get(project.id) || [];
    if (!matches.length) return;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `conv-ptab${state.selectedConversationProjectId === project.id ? ' active' : ''}`;
    tab.innerHTML = `
      <span class="ptab-dot" style="background:${escapeHtml(colorForSeed(project.slug || project.id))}"></span>
      ${escapeHtml(project.name)} <span class="ptab-count">${matches.length}</span>
    `;
    tab.addEventListener('click', () => {
      state.selectedConversationProjectId = project.id;
      renderConversationPanel();
    });
    els.convProjectTabs.appendChild(tab);
  });

  if (noProject.length) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `conv-ptab${state.selectedConversationProjectId === '__none__' ? ' active' : ''}`;
    tab.innerHTML = `Sem projeto <span class="ptab-count">${noProject.length}</span>`;
    tab.addEventListener('click', () => {
      state.selectedConversationProjectId = '__none__';
      renderConversationPanel();
    });
    els.convProjectTabs.appendChild(tab);
  }
}

function renderConversationPanel() {
  renderConversationTabs();
  els.convSessionsList.innerHTML = '';

  let sessions = state.sessions;
  if (state.selectedConversationProjectId === '__none__') {
    sessions = sessions.filter((session) => !session.project_id);
  } else if (state.selectedConversationProjectId) {
    sessions = sessions.filter((session) => session.project_id === state.selectedConversationProjectId);
  }

  if (!sessions.length) {
    els.convSessionsList.innerHTML = '<div class="conv-empty">Nenhuma conversa neste filtro ainda.</div>';
    return;
  }

  sessions.forEach((session) => {
    const project = state.projects.find((item) => item.id === session.project_id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'conv-sess';
    item.innerHTML = `
      <span class="cs-dot" style="background:${escapeHtml(colorForSeed(project?.slug || session.project_id || session.id))}"></span>
      <div class="cs-body">
        <div class="cs-title">${escapeHtml(session.title || 'Nova conversa')}</div>
        <div class="cs-snippet">${escapeHtml(sessionMeta(session))}</div>
      </div>
      <div class="cs-meta">${escapeHtml(project?.name || 'Sem projeto')}</div>
    `;
    item.addEventListener('click', async () => {
      if (session.project_id) {
        state.selectedProjectId = session.project_id;
        ensureTab(project);
      }
      await openSession(session.id);
    });
    els.convSessionsList.appendChild(item);
  });
}

function renderProviderControls() {
  fillSelect(
    els.providerAccountSelect,
    state.providerAccounts,
    state.selectedProviderAccountId,
    state.providerAccounts.length ? 'Selecione um provider' : 'Sem provider account',
    (item) => item.id,
    (item) => `${item.displayName} (${item.provider})`
  );
  fillSelect(
    els.chatProviderAccountSelect,
    state.providerAccounts,
    state.selectedProviderAccountId,
    state.providerAccounts.length ? 'Selecione um provider' : 'Sem provider account',
    (item) => item.id,
    (item) => `${item.displayName} (${item.provider})`
  );

  const models = syncModelSelection();
  fillSelect(
    els.modelSelect,
    models,
    state.selectedModel,
    models.length ? 'Selecione o modelo' : 'Sem modelos',
    (item) => item.id,
    (item) => item.label || item.id
  );
  fillSelect(
    els.chatModelSelect,
    models,
    state.selectedModel,
    models.length ? 'Selecione o modelo' : 'Sem modelos',
    (item) => item.id,
    (item) => item.label || item.id
  );

  const providerFormEntry = state.providerCatalog.find((item) => item.id === els.providerKind.value) || state.providerCatalog[0];
  const providerFormModels = providerFormEntry?.models || [];
  fillSelect(
    els.providerModelSelect,
    providerFormModels,
    els.providerModelSelect.value,
    providerFormModels.length ? 'Selecione o modelo default' : 'Sem modelos',
    (item) => item.id,
    (item) => item.label || item.id
  );

  const modeSelect = els.providerForm.querySelector('select[name="mode"]');
  const secretInput = els.providerForm.querySelector('input[name="secret"]');
  const requiresSecret = modeSelect.value === 'byok';
  secretInput.required = requiresSecret;
  secretInput.placeholder = requiresSecret
    ? 'API key / token'
    : 'Opcional quando platform managed';

  const canManage = userCanManageProviders();
  els.toggleProviderFormBtn.classList.toggle('hidden', !canManage);
  if (!canManage) {
    els.providerForm.classList.add('hidden');
  }
}

function renderActivityPanels() {
  els.contextJson.textContent = pretty(state.context || {});
  els.billingJson.textContent = pretty(state.billing || { note: 'Billing indisponível.' });
  els.providersJson.textContent = pretty(state.providerAccounts.length ? state.providerAccounts : { note: 'Sem provider accounts neste workspace.' });
  els.discoveryJson.textContent = pretty(state.discoveryRequests.length ? state.discoveryRequests : { note: 'Sem solicitações de discovery neste environment.' });
}

function renderSessionList() {
  els.sessionList.innerHTML = '';
  const sessions = selectedProjectSessions();

  if (!sessions.length) {
    els.sessionList.innerHTML = '<div class="home-empty">Nenhuma conversa neste projeto.</div>';
    return;
  }

  sessions.forEach((session) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `session-item${session.id === state.selectedSessionId ? ' active' : ''}`;
    item.innerHTML = `
      <div class="s-title">${escapeHtml(session.title || 'Nova conversa')}</div>
      <div class="s-snippet">${escapeHtml(sessionMeta(session))}</div>
      <div class="s-meta">${escapeHtml(session.status || 'active')}</div>
    `;
    item.addEventListener('click', async () => {
      await openSession(session.id);
    });
    els.sessionList.appendChild(item);
  });
}

function renderProjectTabs() {
  pruneTabs();
  els.projectTabs.innerHTML = '';
  state.openTabs.forEach((tab) => {
    const item = document.createElement('div');
    item.className = `project-tab${tab.id === state.selectedProjectId ? ' active' : ''}`;
    item.innerHTML = `
      <span class="tab-dot" style="background:${escapeHtml(tab.color)}"></span>
      <span>${escapeHtml(tab.name)}</span>
      <button class="tab-close" type="button" title="Fechar aba">×</button>
    `;
    item.addEventListener('click', async (event) => {
      if (event.target.closest('.tab-close')) return;
      await openProject(tab.id, false);
    });
    item.querySelector('.tab-close').addEventListener('click', (event) => {
      event.stopPropagation();
      state.openTabs = state.openTabs.filter((entry) => entry.id !== tab.id);
      if (state.selectedProjectId === tab.id) {
        const fallback = state.openTabs[state.openTabs.length - 1];
        if (fallback) {
          openProject(fallback.id, false).catch((error) => showToast(error.message, true));
        } else {
          setScreen('home');
          renderAll();
        }
      } else {
        renderProjectTabs();
      }
    });
    els.projectTabs.appendChild(item);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'project-tab-add';
  add.textContent = '+';
  add.title = 'Voltar aos projetos';
  add.addEventListener('click', () => {
    setScreen('home');
    setPanel('projects');
    renderAll();
  });
  els.projectTabs.appendChild(add);
}

function renderChatHeader() {
  const session = currentSession();
  const project = currentProject();
  const account = currentProviderAccount();
  const models = modelsForProviderAccount(account);
  const currentModel = models.find((item) => item.id === state.selectedModel);
  const consumption = consumptionForSelection(account, state.selectedModel);

  els.currentTitle.value = session?.title || project?.name || 'Nova conversa';
  els.currentProjectBadge.textContent = project?.name || '';
  els.currentProjectBadge.style.display = project ? 'inline-flex' : 'none';
  els.providerCostChip.className = `provider-cost-chip ${consumption.css}`;
  els.providerCostChip.textContent = `${consumption.label} · ${currentModel?.label || state.selectedModel || 'default'}`;
  els.providerCostChip.title = account
    ? `${providerLabel(account)} · ${currentModel?.label || state.selectedModel || 'default'}`
    : 'Selecione um provider account';

  if (!state.latestRun || !['queued', 'running'].includes(state.latestRun.status)) {
    els.queueChip.classList.remove('active');
    els.queueChipText.textContent = '';
  } else {
    els.queueChip.classList.add('active');
    els.queueChipText.textContent = state.latestRun.status === 'queued'
      ? 'Na fila'
      : `Rodando · ${state.latestRun.provider}`;
  }
}

function renderMessageBubble(role, text, meta, extraClass = '') {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}${extraClass ? ` ${extraClass}` : ''}`;
  wrapper.innerHTML = `
    <div>${escapeHtml(text || '')}</div>
    ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
  `;
  return wrapper;
}

function renderChatBody() {
  els.main.innerHTML = '';

  if (!state.selectedProjectId) {
    els.main.innerHTML = `
      <div class="empty-hero">
        <div class="kicker">CHAT</div>
        <h2>Escolha um <em>projeto</em> para começar.</h2>
        <p>Abra um projeto do seu environment e continue a partir das conversas já existentes ou crie uma nova.</p>
      </div>
    `;
    return;
  }

  if (!state.selectedSessionId) {
    els.main.innerHTML = `
      <div class="empty-hero">
        <div class="kicker">CONVERSA</div>
        <h2>Crie uma <em>nova conversa</em>.</h2>
        <p>Use o botão “+ Nova” na sidebar para iniciar uma sessão nesse projeto.</p>
      </div>
    `;
    return;
  }

  if (!state.sessionMessages.length) {
    els.main.innerHTML = `
      <div class="empty-hero">
        <div class="kicker">PRIMEIRO PROMPT</div>
        <h2>Envie a primeira <em>mensagem</em>.</h2>
        <p>O histórico desta sessão nasce aqui e vai ficar vinculado ao seu projeto e environment.</p>
      </div>
    `;
  } else {
    state.sessionMessages.forEach((message) => {
      const content = message.content_json?.text || pretty(message.content_json || {});
      const meta = formatDate(message.created_at);
      const bubble = renderMessageBubble(
        message.role === 'user' ? 'user' : 'assistant',
        content,
        meta,
        message.error_code ? 'err' : ''
      );
      els.main.appendChild(bubble);
    });
  }

  if (state.latestRun && ['queued', 'running'].includes(state.latestRun.status)) {
    const pending = document.createElement('div');
    pending.className = `msg assistant pending${state.latestRun.status === 'running' ? ' running' : ''}`;
    pending.textContent = state.latestRun.status === 'running'
      ? 'Processando no worker...'
      : 'Execução enfileirada...';
    els.main.appendChild(pending);
  }

  els.main.scrollTop = els.main.scrollHeight;
  els.eventsJson.textContent = pretty({
    latestRun: state.latestRun,
    events: state.sessionEvents
  });
}

function renderAll() {
  renderAuthState();
  renderTopSelectors();
  renderHomeHeader();
  renderQuickAccess();
  renderProjectsGrid();
  renderConversationPanel();
  renderProviderControls();
  renderActivityPanels();
  renderSessionList();
  renderProjectTabs();
  renderChatHeader();
  renderChatBody();
}

async function refreshContext() {
  let payload = await api('/v1/context', { method: 'GET' });
  const tenants = payload.tenants || [];

  if (!payload.user) {
    state.context = payload;
    setTenantSlug('');
    setWorkspaceId('');
    setEnvironmentId('');
    setProjectId('');
    setProviderAccountId('');
    setModel('');
    clearSessionState();
    state.openTabs = [];
    return;
  }

  if (!state.selectedTenantSlug || !tenants.some((item) => item.slug === state.selectedTenantSlug)) {
    setTenantSlug(tenants[0]?.slug || '');
    if (state.selectedTenantSlug) {
      payload = await api('/v1/context', { method: 'GET' });
    }
  }

  state.context = payload;
}

async function refreshWorkspaces() {
  if (!currentUser() || !state.selectedTenantSlug) {
    state.workspaces = [];
    setWorkspaceId('');
    return;
  }

  const payload = await api('/v1/workspaces');
  state.workspaces = payload.workspaces || [];
  if (!state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) {
    setWorkspaceId(state.workspaces[0]?.id || '');
  }
}

async function refreshEnvironments() {
  if (!currentUser() || !state.selectedWorkspaceId) {
    state.environments = [];
    setEnvironmentId('');
    return;
  }

  const payload = await api(`/v1/environments?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  state.environments = payload.environments || [];
  if (!state.environments.some((item) => item.id === state.selectedEnvironmentId)) {
    setEnvironmentId(state.environments[0]?.id || '');
  }
}

async function refreshProjects() {
  if (!currentUser() || !state.selectedWorkspaceId || !state.selectedEnvironmentId) {
    state.projects = [];
    setProjectId('');
    state.openTabs = [];
    return;
  }

  const query = new URLSearchParams({
    workspaceId: state.selectedWorkspaceId,
    environmentId: state.selectedEnvironmentId
  });
  const payload = await api(`/v1/projects?${query.toString()}`);
  state.projects = payload.projects || [];
  if (!state.projects.some((item) => item.id === state.selectedProjectId)) {
    setProjectId(state.projects[0]?.id || '');
  }
  pruneTabs();
}

async function refreshProviders() {
  if (!currentUser()) {
    state.providerCatalog = [];
    state.providerAccounts = [];
    setProviderAccountId('');
    setModel('');
    return;
  }

  const catalog = await api('/v1/providers/catalog');
  state.providerCatalog = catalog.providers || [];

  if (!state.selectedTenantSlug || !state.selectedWorkspaceId) {
    state.providerAccounts = [];
    setProviderAccountId('');
    setModel('');
    return;
  }

  const payload = await api(`/v1/provider-accounts?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  state.providerAccounts = payload.accounts || [];
  if (!state.providerAccounts.some((item) => item.id === state.selectedProviderAccountId)) {
    setProviderAccountId(state.providerAccounts[0]?.id || '');
  }
  syncModelSelection();
}

async function refreshSessions() {
  if (!currentUser() || !state.selectedTenantSlug || !state.selectedWorkspaceId) {
    state.sessions = [];
    clearSessionState();
    return;
  }

  const query = new URLSearchParams({ workspaceId: state.selectedWorkspaceId });
  if (state.selectedEnvironmentId) {
    query.set('environmentId', state.selectedEnvironmentId);
  }

  const payload = await api(`/v1/chat/sessions?${query.toString()}`);
  state.sessions = payload.sessions || [];

  if (state.selectedProjectId && !state.projects.some((item) => item.id === state.selectedProjectId)) {
    setProjectId('');
  }

  if (state.selectedSessionId && !state.sessions.some((item) => item.id === state.selectedSessionId)) {
    clearSessionState();
  }

  if (!state.selectedConversationProjectId && state.selectedProjectId) {
    state.selectedConversationProjectId = state.selectedProjectId;
  } else if (state.selectedConversationProjectId && state.selectedConversationProjectId !== '__none__') {
    if (!state.projects.some((item) => item.id === state.selectedConversationProjectId)) {
      state.selectedConversationProjectId = '';
    }
  }
}

async function refreshDiscovery() {
  if (!currentUser() || !state.selectedEnvironmentId) {
    state.discoveryRequests = [];
    return;
  }
  const payload = await api(`/v1/environments/${encodeURIComponent(state.selectedEnvironmentId)}/discovery-requests`);
  state.discoveryRequests = payload.requests || [];
}

async function refreshBilling() {
  if (!currentUser() || !state.selectedTenantSlug) {
    state.billing = { note: 'Selecione um tenant para ver billing.' };
    return;
  }
  try {
    const [summary, health] = await Promise.all([
      api('/v1/billing/summary'),
      api('/v1/billing/health')
    ]);
    state.billing = { summary: summary.summary, health: health.health };
  } catch (error) {
    state.billing = { note: error.message };
  }
}

async function refreshSessionDetail() {
  if (!currentUser() || !state.selectedSessionId) {
    state.sessionMessages = [];
    state.sessionRuns = [];
    state.sessionEvents = [];
    state.latestRun = null;
    stopPolling();
    return;
  }

  const [messagesPayload, runsPayload] = await Promise.all([
    api(`/v1/chat/sessions/${encodeURIComponent(state.selectedSessionId)}/messages`),
    api(`/v1/chat/sessions/${encodeURIComponent(state.selectedSessionId)}/runs`)
  ]);

  state.sessionMessages = messagesPayload.messages || [];
  state.sessionRuns = runsPayload.runs || [];
  state.latestRun = state.sessionRuns[0] || null;

  const session = currentSession();
  if (session?.provider_account_id) {
    setProviderAccountId(session.provider_account_id);
  }
  if (state.latestRun?.model) {
    setModel(state.latestRun.model);
  } else {
    syncModelSelection();
  }

  if (state.latestRun) {
    const eventsPayload = await api(
      `/v1/chat/sessions/${encodeURIComponent(state.selectedSessionId)}/runs/${encodeURIComponent(state.latestRun.id)}/events`
    );
    state.sessionEvents = eventsPayload.events || [];
  } else {
    state.sessionEvents = [];
  }

  schedulePolling();
}

async function refreshWorkspaceScopedData() {
  await refreshEnvironments();
  await refreshProjects();
  await Promise.all([
    refreshProviders(),
    refreshSessions(),
    refreshDiscovery(),
    refreshBilling()
  ]);
  if (state.selectedSessionId) {
    await refreshSessionDetail();
  }
}

async function refreshDashboard() {
  stopPolling();
  await refreshContext();

  if (!currentUser()) {
    state.workspaces = [];
    state.environments = [];
    state.projects = [];
    state.sessions = [];
    state.providerCatalog = [];
    state.providerAccounts = [];
    state.discoveryRequests = [];
    state.billing = null;
    state.openTabs = [];
    clearSessionState();
    setScreen('login');
    renderAll();
    return;
  }

  await refreshWorkspaces();
  await refreshWorkspaceScopedData();
  setScreen(state.activeScreen === 'app' && state.selectedSessionId ? 'app' : 'home');
  renderAll();
}

function buildSessionTitle(project) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return project ? `${project.name} · ${time}` : `Nova conversa · ${time}`;
}

async function createSessionAndOpen(projectId = state.selectedProjectId) {
  if (!currentUser()) {
    showToast('Entre antes de criar uma conversa.', true);
    return;
  }
  if (!state.selectedWorkspaceId || !state.selectedEnvironmentId || !projectId) {
    showToast('Selecione workspace, environment e projeto antes de criar a conversa.', true);
    return;
  }
  if (!state.selectedProviderAccountId) {
    showToast('Configure um provider account antes de criar a conversa.', true);
    return;
  }

  const project = state.projects.find((item) => item.id === projectId) || null;
  const payload = await api('/v1/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      environmentId: state.selectedEnvironmentId,
      projectId,
      providerAccountId: state.selectedProviderAccountId,
      title: buildSessionTitle(project)
    })
  });

  state.selectedSessionId = payload.session.id;
  await refreshSessions();
  await openSession(payload.session.id);
  showToast('Conversa criada');
}

async function openProject(projectId, createIfEmpty) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  setProjectId(projectId);
  state.selectedConversationProjectId = projectId;
  ensureTab(project);
  setScreen('app');
  renderAll();

  const projectSessions = state.sessions.filter((session) => session.project_id === projectId);
  if (projectSessions.length) {
    await openSession(projectSessions[0].id);
    return;
  }
  if (createIfEmpty) {
    await createSessionAndOpen(projectId);
  } else {
    clearSessionState();
    renderAll();
  }
}

async function openSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  state.selectedSessionId = sessionId;
  if (session.project_id) {
    setProjectId(session.project_id);
    const project = state.projects.find((item) => item.id === session.project_id);
    ensureTab(project);
  }
  if (session.provider_account_id) {
    setProviderAccountId(session.provider_account_id);
  }
  setScreen('app');
  closeSidebar();
  await refreshSessionDetail();
  renderAll();
}

function parseDiscoveryRequest(value) {
  if (!String(value || '').trim()) return {};
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error('O JSON da descoberta está inválido.');
  }
}

function prefillTokensFromUrl() {
  const url = new URL(window.location.href);
  const invite = url.searchParams.get('invite');
  const verify = url.searchParams.get('verify');
  if (invite) {
    els.signupInviteToken.value = invite;
    els.inviteTokenInput.value = invite;
  }
  if (verify) {
    els.verificationTokenInput.value = verify;
  }
}

function autoResizeComposer() {
  els.msgInput.style.height = 'auto';
  els.msgInput.style.height = `${Math.min(els.msgInput.scrollHeight, 140)}px`;
}

els.homeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setPanel(tab.dataset.panel);
  });
});

els.homeUserChip.addEventListener('click', () => {
  setPanel('activities');
});

els.goHomeBtn.addEventListener('click', () => {
  setScreen('home');
  setPanel('projects');
  renderAll();
});

els.refreshBtn.addEventListener('click', async () => {
  try {
    await refreshDashboard();
    showToast('Dados atualizados');
  } catch (error) {
    showToast(error.message, true);
  }
});

async function performSignout() {
  await api('/v1/auth/signout', {
    method: 'POST',
    body: JSON.stringify({})
  });
  showToast('Sessão encerrada');
  await refreshDashboard();
}

els.signoutBtn.addEventListener('click', () => performSignout().catch((error) => showToast(error.message, true)));
els.signoutBtnSidebar.addEventListener('click', () => performSignout().catch((error) => showToast(error.message, true)));

async function resendVerification() {
  await api('/v1/auth/request-email-verification', {
    method: 'POST',
    body: JSON.stringify({})
  });
  showToast('Email de verificação reenviado');
}

els.requestVerificationBtn.addEventListener('click', () => resendVerification().catch((error) => showToast(error.message, true)));
els.bannerVerificationBtn.addEventListener('click', () => resendVerification().catch((error) => showToast(error.message, true)));

els.signinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.loginError.textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });
    showToast('Login realizado');
    await refreshDashboard();
  } catch (error) {
    els.loginError.textContent = error.message;
    showToast(error.message, true);
  }
});

els.signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        inviteToken: form.get('inviteToken')
      })
    });
    showToast(payload.acceptedInvite?.tenantId ? 'Conta criada e convite aceito' : 'Conta criada');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.verifyEmailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ verificationToken: form.get('verificationToken') })
    });
    showToast('Email verificado');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.inviteAcceptForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/v1/members/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ inviteToken: form.get('inviteToken') })
    });
    showToast('Convite aceito');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.tenantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/tenants/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        tenantName: form.get('tenantName'),
        tenantSlug: form.get('tenantSlug'),
        workspaceName: form.get('workspaceName'),
        planId: form.get('planId')
      })
    });
    setTenantSlug(payload.tenant.slug);
    showToast('Tenant criado');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.toggleEnvironmentFormBtn.addEventListener('click', () => {
  if (!userCanEdit()) {
    showToast('Seu papel atual não pode criar environments.', true);
    return;
  }
  els.environmentForm.classList.toggle('hidden');
});

els.toggleProjectFormBtn.addEventListener('click', () => {
  if (!userCanEdit()) {
    showToast('Seu papel atual não pode criar projetos.', true);
    return;
  }
  els.projectForm.classList.toggle('hidden');
});

els.toggleDiscoveryFormBtn.addEventListener('click', () => {
  if (!userCanEdit()) {
    showToast('Seu papel atual não pode pedir discovery.', true);
    return;
  }
  els.discoveryForm.classList.toggle('hidden');
});

els.environmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/environments', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        name: form.get('name'),
        slug: form.get('slug'),
        kind: form.get('kind'),
        host: form.get('host'),
        port: form.get('port'),
        agentIdentifier: form.get('agentIdentifier')
      })
    });
    setEnvironmentId(payload.environment.id);
    event.currentTarget.reset();
    els.environmentForm.classList.add('hidden');
    showToast('Environment salvo');
    await refreshWorkspaceScopedData();
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (!state.selectedEnvironmentId) {
    showToast('Selecione um environment antes de criar o projeto.', true);
    return;
  }
  try {
    const payload = await api('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        environmentId: state.selectedEnvironmentId,
        name: form.get('name'),
        slug: form.get('slug'),
        rootPath: form.get('rootPath'),
        source: form.get('source')
      })
    });
    setProjectId(payload.project.id);
    event.currentTarget.reset();
    els.projectForm.classList.add('hidden');
    showToast('Projeto salvo');
    await refreshWorkspaceScopedData();
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.discoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedEnvironmentId) {
    showToast('Selecione um environment antes de pedir discovery.', true);
    return;
  }
  const form = new FormData(event.currentTarget);
  try {
    await api(`/v1/environments/${encodeURIComponent(state.selectedEnvironmentId)}/discovery-requests`, {
      method: 'POST',
      body: JSON.stringify({
        strategy: form.get('strategy'),
        request: parseDiscoveryRequest(form.get('requestJson'))
      })
    });
    event.currentTarget.reset();
    els.discoveryForm.classList.add('hidden');
    showToast('Solicitação enfileirada');
    await refreshDiscovery();
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.toggleProviderFormBtn.addEventListener('click', () => {
  if (!userCanManageProviders()) {
    showToast('Seu papel atual não pode criar provider accounts.', true);
    return;
  }
  els.providerForm.classList.toggle('hidden');
});

els.providerKind.addEventListener('change', () => {
  renderProviderControls();
});

els.providerForm.querySelector('select[name="mode"]').addEventListener('change', () => {
  renderProviderControls();
});

els.providerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api('/v1/provider-accounts', {
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
    setProviderAccountId(payload.account.id);
    event.currentTarget.reset();
    els.providerForm.classList.add('hidden');
    showToast('Provider account salvo');
    await refreshProviders();
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.tenantSelect.addEventListener('change', async (event) => {
  setTenantSlug(event.currentTarget.value);
  setWorkspaceId('');
  setEnvironmentId('');
  setProjectId('');
  clearSessionState();
  state.selectedConversationProjectId = '';
  state.openTabs = [];
  await refreshDashboard();
});

els.workspaceSelect.addEventListener('change', async (event) => {
  setWorkspaceId(event.currentTarget.value);
  setEnvironmentId('');
  setProjectId('');
  clearSessionState();
  state.selectedConversationProjectId = '';
  state.openTabs = [];
  await refreshWorkspaceScopedData();
  renderAll();
});

els.environmentSelect.addEventListener('change', async (event) => {
  setEnvironmentId(event.currentTarget.value);
  setProjectId('');
  clearSessionState();
  state.selectedConversationProjectId = '';
  state.openTabs = [];
  await refreshWorkspaceScopedData();
  renderAll();
});

els.providerAccountSelect.addEventListener('change', () => {
  setProviderAccountId(els.providerAccountSelect.value);
  syncModelSelection();
  renderAll();
});

els.chatProviderAccountSelect.addEventListener('change', () => {
  setProviderAccountId(els.chatProviderAccountSelect.value);
  syncModelSelection();
  renderAll();
});

els.modelSelect.addEventListener('change', () => {
  setModel(els.modelSelect.value);
  renderAll();
});

els.chatModelSelect.addEventListener('change', () => {
  setModel(els.chatModelSelect.value);
  renderAll();
});

els.createSessionBtn.addEventListener('click', () => {
  createSessionAndOpen().catch((error) => showToast(error.message, true));
});

els.createSessionBtnSidebar.addEventListener('click', () => {
  createSessionAndOpen().catch((error) => showToast(error.message, true));
});

els.projectSearch.addEventListener('input', () => {
  renderProjectsGrid();
});

els.sidebarMenuBtn.addEventListener('click', openSidebar);
els.sidebarCloseBtn.addEventListener('click', closeSidebar);
els.sidebarOverlay.addEventListener('click', closeSidebar);

els.msgInput.addEventListener('input', autoResizeComposer);

els.promptForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedSessionId) {
    showToast('Crie ou abra uma conversa antes de enviar.', true);
    return;
  }
  const prompt = String(new FormData(event.currentTarget).get('prompt') || '').trim();
  if (!prompt) {
    showToast('Digite uma mensagem antes de enviar.', true);
    return;
  }
  try {
    await api(`/v1/chat/sessions/${encodeURIComponent(state.selectedSessionId)}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        providerAccountId: state.selectedProviderAccountId,
        model: state.selectedModel
      })
    });
    els.msgInput.value = '';
    autoResizeComposer();
    showToast('Execução enfileirada');
    await refreshSessionDetail();
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
});

async function boot() {
  prefillTokensFromUrl();
  autoResizeComposer();
  try {
    await refreshDashboard();
    renderAll();
  } catch (error) {
    setScreen('login');
    renderAll();
    showToast(error.message, true);
  }
}

boot();
