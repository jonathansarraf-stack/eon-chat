'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  const servicePath = require.resolve('../src/services/email-delivery-service');
  const configPath = require.resolve('../src/config');
  const dbPath = require.resolve('../src/db');
  const notificationsRepoPath = require.resolve('../src/repositories/notifications');

  delete require.cache[servicePath];
  delete require.cache[configPath];
  delete require.cache[dbPath];
  delete require.cache[notificationsRepoPath];

  const tempDir = overrides.emailRuntimeDir || fs.mkdtempSync(path.join(os.tmpdir(), 'eon-chat-email-'));

  mockModule('../src/config', {
    emailRuntimeDir: tempDir,
    emailDeliveryMode: overrides.emailDeliveryMode || 'console',
    emailFromAddress: overrides.emailFromAddress || 'no-reply@test.local'
  });

  mockModule('../src/db', {
    withTransaction: overrides.withTransaction || (async (fn) => fn({ kind: 'tx' }))
  });

  mockModule('../src/repositories/notifications', {
    claimNextPendingEmail: overrides.claimNextPendingEmail || (async () => null),
    markEmailSent: overrides.markEmailSent || (async () => ({})),
    markEmailFailed: overrides.markEmailFailed || (async () => ({}))
  });

  return {
    tempDir,
    service: require('../src/services/email-delivery-service')
  };
}

test('renderTemplate renders verification emails', () => {
  const { service } = loadService();
  const rendered = service.renderTemplate({
    template: 'email_verification',
    payload_json: {
      name: 'Ana',
      verifyUrl: 'https://example.com/verify'
    }
  });

  assert.match(rendered.text, /Verify your Eon Chat email/);
  assert.match(rendered.text, /https:\/\/example.com\/verify/);
});

test('processNextEmail writes artifact and marks email sent', async () => {
  const sentIds = [];
  const { service, tempDir } = loadService({
    claimNextPendingEmail: async () => ({
      id: 'mail_123',
      kind: 'email_verification',
      to_email: 'ana@acme.com',
      subject: 'Verify',
      template: 'email_verification',
      payload_json: {
        name: 'Ana',
        verifyUrl: 'https://example.com/verify'
      }
    }),
    markEmailSent: async (_db, emailId) => {
      sentIds.push(emailId);
      return { id: emailId };
    }
  });

  const result = await service.processNextEmail();

  assert.equal(result.status, 'sent');
  assert.deepEqual(sentIds, ['mail_123']);
  const artifact = JSON.parse(fs.readFileSync(path.join(tempDir, 'mail_123.json'), 'utf8'));
  assert.equal(artifact.to, 'ana@acme.com');
  assert.equal(artifact.subject, 'Verify');
});

test('processNextEmail marks failure when delivery crashes', async () => {
  const failures = [];
  const { service } = loadService({
    emailRuntimeDir: '/dev/null/this-will-fail',
    claimNextPendingEmail: async () => ({
      id: 'mail_999',
      kind: 'tenant_invite',
      to_email: 'dev@acme.com',
      subject: 'Invite',
      template: 'tenant_invite',
      payload_json: {
        tenantName: 'Acme',
        role: 'developer',
        inviteUrl: 'https://example.com/invite'
      }
    }),
    markEmailFailed: async (_db, emailId, errorMessage) => {
      failures.push({ emailId, errorMessage });
      return { id: emailId };
    }
  });

  const result = await service.processNextEmail();

  assert.equal(result.status, 'failed');
  assert.equal(failures[0].emailId, 'mail_999');
});
