'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractSlugFromHost } = require('../src/tenant');
const { normalizeSlug } = require('../src/services/tenant-service');
const { parseCookies, serializeCookie } = require('../src/cookies');
const { requireUser, requireVerifiedUser } = require('../src/auth');

test('extractSlugFromHost resolves subdomain and ignores localhost/ip', () => {
  assert.equal(extractSlugFromHost('acme.eonchat.app'), 'acme');
  assert.equal(extractSlugFromHost('localhost:4080'), '');
  assert.equal(extractSlugFromHost('127.0.0.1:4080'), '');
});

test('normalizeSlug normalizes tenant names', () => {
  assert.equal(normalizeSlug('Acme Labs'), 'acme-labs');
  assert.equal(normalizeSlug('  __A!  '), 'a');
});

test('cookie helpers round-trip values', () => {
  const header = serializeCookie('session', 'abc123', { maxAge: 10, sameSite: 'Lax', path: '/' });
  const cookies = parseCookies(header);
  assert.equal(cookies.session, 'abc123');
});

test('requireUser throws when called imperatively without a user', () => {
  assert.throws(
    () => requireUser({ context: {} }),
    (error) => error.code === 'auth_required'
  );
});

test('requireVerifiedUser throws when email is not verified', () => {
  assert.throws(
    () => requireVerifiedUser({ context: { user: { id: 'user_123', emailVerifiedAt: null } } }),
    (error) => error.code === 'email_verification_required'
  );
});
