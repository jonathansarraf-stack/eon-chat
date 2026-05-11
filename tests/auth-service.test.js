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

function loadAuthService(overrides = {}) {
  const servicePath = require.resolve('../src/services/auth-service');
  const configPath = require.resolve('../src/config');
  const dbPath = require.resolve('../src/db');
  const cryptoPath = require.resolve('../src/crypto');
  const usersRepoPath = require.resolve('../src/repositories/users');
  const sessionsRepoPath = require.resolve('../src/repositories/sessions');
  const memberServicePath = require.resolve('../src/services/member-service');
  const notificationsRepoPath = require.resolve('../src/repositories/notifications');

  delete require.cache[servicePath];
  delete require.cache[configPath];
  delete require.cache[dbPath];
  delete require.cache[cryptoPath];
  delete require.cache[usersRepoPath];
  delete require.cache[sessionsRepoPath];
  delete require.cache[memberServicePath];
  delete require.cache[notificationsRepoPath];

  mockModule('../src/config', {
    sessionTtlDays: overrides.sessionTtlDays || 14
  });

  mockModule('../src/db', {
    getPool: overrides.getPool || (() => ({ kind: 'pool' })),
    withTransaction: overrides.withTransaction || (async (fn) => fn({ kind: 'tx' }))
  });

  mockModule('../src/crypto', {
    randomToken: overrides.randomToken || (() => 'session_token_123'),
    hashToken: overrides.hashToken || ((value) => `hash:${value}`),
    hashPassword: overrides.hashPassword || (async (value) => `pw:${value}`),
    verifyPassword: overrides.verifyPassword || (async () => true)
  });

  mockModule('../src/repositories/users', {
    findUserByEmail: overrides.findUserByEmail || (async () => null),
    createUser: overrides.createUser || (async (_db, input) => ({
      id: 'user_123',
      email: input.email,
      name: input.name || null,
      global_role: 'user'
    })),
    touchLastLogin: overrides.touchLastLogin || (async () => {}),
    findUserById: overrides.findUserById || (async () => ({
      id: 'user_123',
      email: 'new@acme.com',
      name: 'New User',
      global_role: 'user'
    })),
    createEmailVerificationToken: overrides.createEmailVerificationToken || (async (_db, input) => ({
      id: 'evt_123',
      user_id: input.userId,
      email: input.email,
      verification_token_hash: input.verificationTokenHash,
      expires_at: input.expiresAt.toISOString(),
      consumed_at: null,
      created_at: '2026-04-26T00:00:00.000Z'
    })),
    findEmailVerificationToken: overrides.findEmailVerificationToken || (async () => null),
    consumeEmailVerificationToken: overrides.consumeEmailVerificationToken || (async () => {}),
    setEmailVerified: overrides.setEmailVerified || (async (_db, userId) => ({
      id: userId,
      email: 'new@acme.com',
      name: 'New User',
      global_role: 'user',
      email_verified_at: '2026-04-26T01:00:00.000Z'
    }))
  });

  mockModule('../src/repositories/sessions', {
    createSession: overrides.createSession || (async () => ({ id: 'sess_123' })),
    getSessionWithUser: overrides.getSessionWithUser || (async () => null),
    touchSession: overrides.touchSession || (async () => {}),
    deleteSession: overrides.deleteSession || (async () => {})
  });

  mockModule('../src/services/member-service', {
    acceptInviteForUser: overrides.acceptInviteForUser || (async () => null)
  });

  mockModule('../src/repositories/notifications', {
    createEmailOutboxEntry: overrides.createEmailOutboxEntry || (async () => ({
      id: 'mail_123'
    }))
  });

  return require('../src/services/auth-service');
}

test('signUp creates normal account without invite acceptance', async () => {
  let inviteAcceptanceCalled = false;
  let verificationQueued = false;
  const authService = loadAuthService({
    acceptInviteForUser: async () => {
      inviteAcceptanceCalled = true;
      return null;
    },
    createEmailOutboxEntry: async () => {
      verificationQueued = true;
      return { id: 'mail_123' };
    }
  });

  const result = await authService.signUp({
    email: 'new@acme.com',
    password: 'supersecret',
    name: 'New User'
  });

  assert.equal(result.user.email, 'new@acme.com');
  assert.equal(result.sessionToken, 'session_token_123');
  assert.equal(result.acceptedInvite, null);
  assert.equal(inviteAcceptanceCalled, false);
  assert.equal(verificationQueued, true);
  assert.match(result.emailVerification.verifyUrl, /\?verify=session_token_123$/);
});

test('signUp accepts invite token inside the same signup flow', async () => {
  let capturedInvite = null;
  const authService = loadAuthService({
    acceptInviteForUser: async ({ user, inviteToken }) => {
      capturedInvite = { user, inviteToken };
      return {
        tenantId: 'tenant_123',
        membership: {
          role: 'developer'
        }
      };
    }
  });

  const result = await authService.signUp({
    email: 'dev@acme.com',
    password: 'supersecret',
    name: 'Dev User',
    inviteToken: 'invite_token_123'
  });

  assert.deepEqual(capturedInvite, {
    user: {
      id: 'user_123',
      email: 'dev@acme.com',
      name: 'Dev User',
      global_role: 'user'
    },
    inviteToken: 'invite_token_123'
  });
  assert.equal(result.acceptedInvite.tenantId, 'tenant_123');
  assert.equal(result.acceptedInvite.membership.role, 'developer');
});

test('verifyEmail consumes token and marks user verified', async () => {
  const consumed = [];
  const authService = loadAuthService({
    findEmailVerificationToken: async (_db, tokenHash) => ({
      id: 'evt_123',
      user_id: 'user_123',
      email: 'new@acme.com',
      verification_token_hash: tokenHash,
      expires_at: '2099-01-01T00:00:00.000Z',
      consumed_at: null,
      created_at: '2026-04-26T00:00:00.000Z'
    }),
    consumeEmailVerificationToken: async (_db, tokenId) => {
      consumed.push(tokenId);
    }
  });

  const result = await authService.verifyEmail({
    verificationToken: 'verify_token_123'
  });

  assert.equal(result.user.id, 'user_123');
  assert.deepEqual(consumed, ['evt_123']);
});
