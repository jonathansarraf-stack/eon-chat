'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword, hashToken } = require('../src/crypto');
const { encryptSecret, decryptSecret, maskSecret } = require('../src/secrets');

test('password hashes verify correctly', async () => {
  const hash = await hashPassword('super-secret-password');
  assert.equal(await verifyPassword('super-secret-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('token hashes are deterministic', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('def'));
});

test('secrets can be encrypted and decrypted', () => {
  const encrypted = encryptSecret('sk_test_1234567890');
  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, 'sk_test_1234567890');
});

test('secret masking hides middle characters', () => {
  assert.equal(maskSecret('1234567890abcdef'), '1234••••cdef');
});
