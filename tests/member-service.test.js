'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  };
}

function loadService(overrides = {}) {
  const servicePath = require.resolve('../src/services/member-service');
  const dbPath = require.resolve('../src/db');
  const cryptoPath = require.resolve('../src/crypto');
  const membersRepoPath = require.resolve('../src/repositories/members');
  const notificationsRepoPath = require.resolve('../src/repositories/notifications');
  const tenantsRepoPath = require.resolve('../src/repositories/tenants');
  const usersRepoPath = require.resolve('../src/repositories/users');
  const workspacesRepoPath = require.resolve('../src/repositories/workspaces');

  delete require.cache[servicePath];
  delete require.cache[dbPath];
  delete require.cache[cryptoPath];
  delete require.cache[membersRepoPath];
  delete require.cache[notificationsRepoPath];
  delete require.cache[tenantsRepoPath];
  delete require.cache[usersRepoPath];
  delete require.cache[workspacesRepoPath];

  mockModule('../src/db', {
    getPool: overrides.getPool || (() => ({ kind: 'pool' })),
    withTransaction: overrides.withTransaction || (async (fn) => fn({ kind: 'tx' }))
  });

  mockModule('../src/crypto', {
    randomToken: overrides.randomToken || (() => 'invite_token_123'),
    hashToken: overrides.hashToken || ((value) => `hash:${value}`)
  });

  mockModule('../src/repositories/members', {
    listTenantMembers: overrides.listTenantMembers || (async () => []),
    listTenantInvites: overrides.listTenantInvites || (async () => []),
    findOpenInviteByEmail: overrides.findOpenInviteByEmail || (async () => null),
    createTenantInvite: overrides.createTenantInvite || (async (_db, input) => ({
      id: 'invite_123',
      tenant_id: input.tenantId,
      email: input.email,
      role: input.role,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt.toISOString(),
      accepted_at: null,
      created_at: '2026-04-26T00:00:00.000Z'
    })),
    findInviteByTokenHash: overrides.findInviteByTokenHash || (async () => null),
    markInviteAccepted: overrides.markInviteAccepted || (async () => {}),
    upsertTenantMembership: overrides.upsertTenantMembership || (async (_db, input) => ({
      id: 'membership_123',
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
      status: 'active',
      invited_by: input.invitedBy,
      created_at: '2026-04-26T00:00:00.000Z',
      updated_at: '2026-04-26T00:00:00.000Z'
    })),
    upsertWorkspaceMembership: overrides.upsertWorkspaceMembership || (async () => ({}))
  });

  mockModule('../src/repositories/notifications', {
    createEmailOutboxEntry: overrides.createEmailOutboxEntry || (async () => ({ id: 'mail_123' }))
  });

  mockModule('../src/repositories/tenants', {
    findTenantMembership: overrides.findTenantMembership || (async () => null)
  });

  mockModule('../src/repositories/users', {
    findUserByEmail: overrides.findUserByEmail || (async () => null)
  });

  mockModule('../src/repositories/workspaces', {
    listActiveWorkspacesForTenant: overrides.listActiveWorkspacesForTenant || (async () => [])
  });

  return require('../src/services/member-service');
}

test('inviteMember requires owner or admin role', async () => {
  const service = loadService();

  await assert.rejects(
    service.inviteMember({
      tenant: { id: 'tenant_123' },
      membership: { role: 'developer', status: 'active' },
      user: { id: 'user_123' },
      input: { email: 'teammate@acme.com', role: 'developer' }
    }),
    (error) => {
      assert.equal(error.code, 'invite_forbidden');
      return true;
    }
  );
});

test('inviteMember creates tokenized invite for tenant admin', async () => {
  let capturedInput = null;
  let outboxPayload = null;
  const service = loadService({
    createTenantInvite: async (_db, input) => {
      capturedInput = input;
      return {
        id: 'invite_123',
        tenant_id: input.tenantId,
        email: input.email,
        role: input.role,
        invited_by: input.invitedBy,
        expires_at: input.expiresAt.toISOString(),
        accepted_at: null,
        created_at: '2026-04-26T00:00:00.000Z'
      };
    },
    createEmailOutboxEntry: async (_db, payload) => {
      outboxPayload = payload;
      return { id: 'mail_123' };
    }
  });

  const invite = await service.inviteMember({
    tenant: { id: 'tenant_123', name: 'Acme' },
    membership: { role: 'admin', status: 'active' },
    user: { id: 'user_123' },
    input: { email: 'Teammate@Acme.com', role: 'developer' }
  });

  assert.equal(capturedInput.email, 'teammate@acme.com');
  assert.equal(capturedInput.inviteTokenHash, 'hash:invite_token_123');
  assert.equal(invite.inviteToken, 'invite_token_123');
  assert.match(invite.inviteUrl, /\?invite=invite_token_123$/);
  assert.equal(outboxPayload.kind, 'tenant_invite');
  assert.equal(outboxPayload.toEmail, 'teammate@acme.com');
});

test('acceptInvite rejects mismatched signed-in email', async () => {
  const service = loadService({
    findInviteByTokenHash: async () => ({
      id: 'invite_123',
      tenant_id: 'tenant_123',
      email: 'owner@acme.com',
      role: 'developer',
      invited_by: 'user_admin',
      expires_at: '2099-01-01T00:00:00.000Z',
      accepted_at: null,
      created_at: '2026-04-26T00:00:00.000Z'
    })
  });

  await assert.rejects(
    service.acceptInvite({
      user: { id: 'user_456', email: 'someoneelse@acme.com' },
      inviteToken: 'invite_token_123'
    }),
    (error) => {
      assert.equal(error.code, 'invite_email_mismatch');
      return true;
    }
  );
});

test('acceptInvite activates tenant membership and workspace access', async () => {
  const workspaceCalls = [];
  const service = loadService({
    findInviteByTokenHash: async () => ({
      id: 'invite_123',
      tenant_id: 'tenant_123',
      email: 'dev@acme.com',
      role: 'developer',
      invited_by: 'user_admin',
      expires_at: '2099-01-01T00:00:00.000Z',
      accepted_at: null,
      created_at: '2026-04-26T00:00:00.000Z'
    }),
    listActiveWorkspacesForTenant: async () => ([
      { id: 'ws_1' },
      { id: 'ws_2' }
    ]),
    upsertWorkspaceMembership: async (_db, input) => {
      workspaceCalls.push(input);
      return input;
    }
  });

  const result = await service.acceptInvite({
    user: { id: 'user_456', email: 'dev@acme.com', name: 'Dev User' },
    inviteToken: 'invite_token_123'
  });

  assert.equal(result.membership.role, 'developer');
  assert.deepEqual(workspaceCalls, [
    { workspaceId: 'ws_1', userId: 'user_456', role: 'editor' },
    { workspaceId: 'ws_2', userId: 'user_456', role: 'editor' }
  ]);
});
