'use strict';

const crypto = require('crypto');
const config = require('./config');

function keyMaterial() {
  return crypto.createHash('sha256').update(config.secretsMasterKey).digest();
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptSecret(ciphertext) {
  if (!ciphertext || !ciphertext.startsWith('enc:')) {
    throw new Error('invalid secret format');
  }
  const buffer = Buffer.from(ciphertext.slice(4), 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function maskSecret(value) {
  const secret = String(value || '');
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  maskSecret
};
