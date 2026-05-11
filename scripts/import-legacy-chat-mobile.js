'use strict';

const { execFileSync } = require('child_process');
const { Client } = require('pg');
const config = require('../src/config');

const LEGACY_DB_PATH = process.env.LEGACY_CHAT_DB_PATH || '/opt/clawdio/chat-mobile/chat.db';
const DEFAULT_IMPORTED_PLAN_ID = process.env.LEGACY_IMPORT_PLAN_ID || 'pro';

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

function titleize(value) {
  const text = String(value || '').trim();
  if (!text) return 'Legacy user';
  return text
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function emailName(email) {
  return titleize(String(email || '').split('@')[0] || 'Legacy user');
}

function sqlQuote(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function runSqliteQuery(sql) {
  const output = execFileSync('sqlite3', ['-json', LEGACY_DB_PATH, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  }).trim();
  return output ? JSON.parse(output) : [];
}

function toIsoDate(value) {
  const numeric = Number(value || 0);
  if (!numeric) return null;
  const millis = numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function loadLegacyData() {
  const users = runSqliteQuery(`
    select id, email, password_hash, created
    from users
    order by created asc
  `);
  const projects = runSqliteQuery(`
    select id, user_id, name, path, color, description, details, created, updated, archived, url, group_name
    from projects
    order by created asc
  `);
  const sessions = runSqliteQuery(`
    select id, user_id, title, claude_session_id, created, updated, archived, project_id, provider, mode_preset, context_summary, context_summary_updated
    from sessions
    order by created asc
  `);
  const messages = runSqliteQuery(`
    select id, session_id, role, text, ts, duration_ms, cost_usd, is_error
    from messages
    order by ts asc, id asc
  `);

  return { users, projects, sessions, messages };
}

async function ensureImportedUser(client, legacyUser) {
  const existing = await client.query(
    `select id, email, name, global_role, email_verified_at
     from users
     where lower(email) = lower($1)`,
    [legacyUser.email]
  );

  if (existing.rows[0]) {
    const updated = await client.query(
      `update users
       set name = coalesce($2, users.name),
           password_hash = $3,
           email_verified_at = coalesce(users.email_verified_at, now())
       where id = $1
       returning id, email, name, global_role, email_verified_at`,
      [existing.rows[0].id, emailName(legacyUser.email), legacyUser.password_hash]
    );
    return updated.rows[0];
  }

  const created = await client.query(
    `insert into users (email, name, password_hash, email_verified_at, created_at)
     values (lower($1), $2, $3, now(), coalesce($4, now()))
     returning id, email, name, global_role, email_verified_at`,
    [legacyUser.email, emailName(legacyUser.email), legacyUser.password_hash, toIsoDate(legacyUser.created)]
  );
  return created.rows[0];
}

async function resolveUniqueTenantSlug(client, baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const result = await client.query(
      'select id from tenants where slug = $1 and deleted_at is null',
      [slug]
    );
    if (!result.rows[0]) return slug;
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

async function ensureLegacyTenantBundle(client, user) {
  const existing = await client.query(
    `select id, slug, name, status, plan_id
     from tenants
     where owner_user_id = $1
       and slug like 'legacy-%'
       and deleted_at is null
     order by created_at asc
     limit 1`,
    [user.id]
  );

  let tenant = existing.rows[0] || null;
  if (!tenant) {
    const baseSlug = `legacy-${slugify(user.email.split('@')[0]) || user.id.slice(0, 8)}`;
    const tenantSlug = await resolveUniqueTenantSlug(client, baseSlug);
    const inserted = await client.query(
      `insert into tenants (slug, name, status, plan_id, owner_user_id)
       values ($1, $2, 'active', $3, $4)
       returning id, slug, name, status, plan_id`,
      [tenantSlug, `${emailName(user.email)} Personal`, DEFAULT_IMPORTED_PLAN_ID, user.id]
    );
    tenant = inserted.rows[0];
  }

  await client.query(
    `insert into tenant_memberships (tenant_id, user_id, role, status)
     values ($1, $2, 'owner', 'active')
     on conflict (tenant_id, user_id) do update set
       role = 'owner',
       status = 'active',
       updated_at = now()`,
    [tenant.id, user.id]
  );

  const workspaceResult = await client.query(
    `insert into workspaces (tenant_id, name, slug, created_by)
     values ($1, 'Workspace principal', 'default', $2)
     on conflict (tenant_id, slug) do update set
       name = excluded.name,
       updated_at = now()
     returning id, tenant_id, name, slug`,
    [tenant.id, user.id]
  );
  const workspace = workspaceResult.rows[0];

  await client.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, 'workspace_admin')
     on conflict (workspace_id, user_id) do update set
       role = 'workspace_admin'`,
    [workspace.id, user.id]
  );

  await client.query(
    `insert into billing_customers (tenant_id, stripe_customer_id, status)
     values ($1, $2, 'active')
     on conflict (tenant_id) do update set
       stripe_customer_id = excluded.stripe_customer_id,
       status = 'active',
       updated_at = now()`,
    [tenant.id, `legacy_import_${tenant.id}`]
  );

  const environmentResult = await client.query(
    `insert into environments (tenant_id, workspace_id, name, slug, kind, status, metadata_json, created_by, last_seen_at)
     values ($1, $2, 'Legacy import', 'legacy-import', 'local_agent', 'active', $3::jsonb, $4, now())
     on conflict (tenant_id, workspace_id, slug) do update set
       name = excluded.name,
       status = 'active',
       metadata_json = excluded.metadata_json,
       updated_at = now()
     returning id, tenant_id, workspace_id, name, slug, kind, status`,
    [tenant.id, workspace.id, JSON.stringify({ imported: true, source: 'chat-mobile' }), user.id]
  );

  return {
    tenant,
    workspace,
    environment: environmentResult.rows[0]
  };
}

async function ensurePlatformProviderAccount(client, { tenantId, workspaceId, provider, displayName, defaultModel, createdBy }) {
  const existing = await client.query(
    `select id
     from provider_accounts
     where tenant_id = $1
       and workspace_id = $2
       and provider = $3
       and display_name = $4`,
    [tenantId, workspaceId, provider, displayName]
  );

  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await client.query(
    `insert into provider_accounts
       (tenant_id, workspace_id, provider, mode, display_name, status, encrypted_secret_ref, secret_last_rotated_at, config_json, created_by)
     values ($1, $2, $3, 'platform_managed', $4, 'active', null, now(), $5::jsonb, $6)
     returning id`,
    [tenantId, workspaceId, provider, displayName, JSON.stringify({ defaultModel }), createdBy]
  );
  return inserted.rows[0].id;
}

async function ensureDefaultProviderAccounts(client, bundle, user) {
  const providerIds = {};
  if (config.platformManagedAnthropicKey) {
    providerIds.claude_code = await ensurePlatformProviderAccount(client, {
      tenantId: bundle.tenant.id,
      workspaceId: bundle.workspace.id,
      provider: 'claude_code',
      displayName: 'Claude Code',
      defaultModel: 'claude-sonnet-4-20250514',
      createdBy: user.id
    });
  }
  if (config.platformManagedOpenAiKey) {
    providerIds.codex = await ensurePlatformProviderAccount(client, {
      tenantId: bundle.tenant.id,
      workspaceId: bundle.workspace.id,
      provider: 'codex',
      displayName: 'Codex',
      defaultModel: 'gpt-5.3-codex',
      createdBy: user.id
    });
  }
  return providerIds;
}

async function findImportedProject(client, environmentId, legacyProjectId) {
  const result = await client.query(
    `select id
     from projects
     where environment_id = $1
       and metadata_json->>'legacyProjectId' = $2
     limit 1`,
    [environmentId, String(legacyProjectId)]
  );
  return result.rows[0]?.id || null;
}

async function resolveUniqueProjectSlug(client, environmentId, baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const result = await client.query(
      `select id
       from projects
       where environment_id = $1
         and slug = $2
       limit 1`,
      [environmentId, slug]
    );
    if (!result.rows[0]) return slug;
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

async function resolveUniqueProjectRootPath(client, environmentId, baseRootPath, legacyProjectId) {
  let rootPath = baseRootPath;
  let counter = 1;
  while (true) {
    const result = await client.query(
      `select id
       from projects
       where environment_id = $1
         and root_path = $2
       limit 1`,
      [environmentId, rootPath]
    );
    if (!result.rows[0]) return rootPath;
    counter += 1;
    rootPath = `${baseRootPath}#legacy-${String(legacyProjectId).slice(0, 8)}-${counter}`;
  }
}

async function importProject(client, bundle, user, legacyProject) {
  const existingProjectId = await findImportedProject(client, bundle.environment.id, legacyProject.id);
  if (existingProjectId) return existingProjectId;

  const baseSlug = slugify(legacyProject.name || legacyProject.id) || `legacy-${legacyProject.id}`;
  const baseRootPath = legacyProject.path || `/legacy/${legacyProject.id}`;
  const projectSlug = await resolveUniqueProjectSlug(client, bundle.environment.id, baseSlug);
  const projectRootPath = await resolveUniqueProjectRootPath(client, bundle.environment.id, baseRootPath, legacyProject.id);

  const projectResult = await client.query(
    `insert into projects
       (tenant_id, workspace_id, environment_id, name, slug, root_path, source, status, metadata_json, created_by, created_at, updated_at, archived_at)
     values ($1, $2, $3, $4, $5, $6, 'imported', $7, $8::jsonb, $9, coalesce($10, now()), coalesce($11, now()), $12)
     returning id`,
    [
      bundle.tenant.id,
      bundle.workspace.id,
      bundle.environment.id,
      legacyProject.name || 'Projeto legado',
      projectSlug,
      projectRootPath,
      Number(legacyProject.archived) ? 'archived' : 'active',
      JSON.stringify({
        imported: true,
        source: 'chat-mobile',
        legacyProjectId: String(legacyProject.id),
        legacyRootPath: legacyProject.path || null,
        color: legacyProject.color || null,
        description: legacyProject.description || null,
        details: legacyProject.details || null,
        url: legacyProject.url || null,
        groupName: legacyProject.group_name || null
      }),
      user.id,
      toIsoDate(legacyProject.created),
      toIsoDate(legacyProject.updated) || toIsoDate(legacyProject.created),
      Number(legacyProject.archived) ? (toIsoDate(legacyProject.updated) || new Date().toISOString()) : null
    ]
  );
  return projectResult.rows[0].id;
}

async function findImportedSession(client, workspaceId, userId, legacySessionId) {
  const result = await client.query(
    `select id
     from chat_sessions
     where workspace_id = $1
       and user_id = $2
       and metadata_json->>'legacySessionId' = $3
     limit 1`,
    [workspaceId, userId, String(legacySessionId)]
  );
  return result.rows[0]?.id || null;
}

function providerKeyFromLegacy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'codex') return 'codex';
  return 'claude_code';
}

async function importSession(client, bundle, user, providerIds, projectId, legacySession, sessionMessages) {
  const existingSessionId = await findImportedSession(client, bundle.workspace.id, user.id, legacySession.id);
  if (existingSessionId) return { sessionId: existingSessionId, inserted: false };

  const providerKey = providerKeyFromLegacy(legacySession.provider);
  const providerAccountId = providerIds[providerKey] || null;

  const sessionResult = await client.query(
    `insert into chat_sessions
       (tenant_id, workspace_id, environment_id, project_id, user_id, provider_account_id, title, status, metadata_json, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, coalesce($10, now()), coalesce($11, now()))
     returning id`,
    [
      bundle.tenant.id,
      bundle.workspace.id,
      bundle.environment.id,
      projectId,
      user.id,
      providerAccountId,
      legacySession.title || 'Conversa importada',
      Number(legacySession.archived) ? 'archived' : 'active',
      JSON.stringify({
        imported: true,
        source: 'chat-mobile',
        legacySessionId: String(legacySession.id),
        legacyProvider: legacySession.provider || 'claude',
        legacyModePreset: legacySession.mode_preset || 'padrao',
        legacyClaudeSessionId: legacySession.claude_session_id || null,
        contextSummary: legacySession.context_summary || null,
        contextSummaryUpdatedAt: toIsoDate(legacySession.context_summary_updated)
      }),
      toIsoDate(legacySession.created),
      toIsoDate(legacySession.updated) || toIsoDate(legacySession.created)
    ]
  );
  const sessionId = sessionResult.rows[0].id;

  for (const message of sessionMessages) {
    await client.query(
      `insert into chat_messages (session_id, role, content_json, error_code, created_at)
       values ($1, $2, $3::jsonb, $4, coalesce($5, now()))`,
      [
        sessionId,
        message.role || 'user',
        JSON.stringify({
          text: message.text || '',
          imported: true,
          source: 'chat-mobile',
          legacyMessageId: String(message.id),
          durationMs: message.duration_ms || null,
          costUsd: message.cost_usd || null
        }),
        Number(message.is_error) ? 'legacy_error' : null,
        toIsoDate(message.ts)
      ]
    );
  }

  return { sessionId, inserted: true };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const { users, projects, sessions, messages } = await loadLegacyData();
  const projectsByUser = new Map();
  const sessionsByUser = new Map();
  const messagesBySession = new Map();

  for (const project of projects) {
    const list = projectsByUser.get(project.user_id) || [];
    list.push(project);
    projectsByUser.set(project.user_id, list);
  }
  for (const session of sessions) {
    const list = sessionsByUser.get(session.user_id) || [];
    list.push(session);
    sessionsByUser.set(session.user_id, list);
  }
  for (const message of messages) {
    const list = messagesBySession.get(message.session_id) || [];
    list.push(message);
    messagesBySession.set(message.session_id, list);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const summary = {
    importedUsers: 0,
    importedProjects: 0,
    importedSessions: 0,
    importedMessages: 0,
    users: []
  };

  try {
    await client.query('begin');

    for (const legacyUser of users) {
      const user = await ensureImportedUser(client, legacyUser);
      const bundle = await ensureLegacyTenantBundle(client, user);
      const providerIds = await ensureDefaultProviderAccounts(client, bundle, user);

      const legacyProjects = projectsByUser.get(legacyUser.id) || [];
      const legacySessions = sessionsByUser.get(legacyUser.id) || [];
      const projectMap = new Map();

      for (const legacyProject of legacyProjects) {
        const importedProjectId = await importProject(client, bundle, user, legacyProject);
        projectMap.set(String(legacyProject.id), importedProjectId);
      }

      let importedSessionCount = 0;
      let importedMessageCount = 0;

      for (const legacySession of legacySessions) {
        const projectId = legacySession.project_id ? (projectMap.get(String(legacySession.project_id)) || null) : null;
        const sessionMessages = messagesBySession.get(legacySession.id) || [];
        const { inserted } = await importSession(client, bundle, user, providerIds, projectId, legacySession, sessionMessages);
        if (inserted) {
          importedSessionCount += 1;
          importedMessageCount += sessionMessages.length;
        }
      }

      summary.importedUsers += 1;
      summary.importedProjects += legacyProjects.length;
      summary.importedSessions += importedSessionCount;
      summary.importedMessages += importedMessageCount;
      summary.users.push({
        email: user.email,
        tenantSlug: bundle.tenant.slug,
        workspaceId: bundle.workspace.id,
        environmentId: bundle.environment.id,
        projects: legacyProjects.length,
        sessions: importedSessionCount,
        messages: importedMessageCount
      });
    }

    await client.query('commit');
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[import-legacy-chat-mobile] failed:', error.message);
  process.exit(1);
});
