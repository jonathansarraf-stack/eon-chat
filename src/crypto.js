'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function isLegacyBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$\d{2}\$/.test(hash);
}

function isScryptHash(hash) {
  return typeof hash === 'string' && hash.includes(':');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, hash) {
  if (isLegacyBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }

  return new Promise((resolve, reject) => {
    if (!isScryptHash(hash)) return resolve(false);
    const [salt, stored] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      const storedBuffer = Buffer.from(stored, 'hex');
      const computedBuffer = Buffer.from(key.toString('hex'), 'hex');
      if (!storedBuffer.length || storedBuffer.length !== computedBuffer.length) {
        return resolve(false);
      }
      resolve(crypto.timingSafeEqual(storedBuffer, computedBuffer));
    });
  });
}

function needsPasswordRehash(hash) {
  return isLegacyBcryptHash(hash);
}

module.exports = {
  randomToken,
  hashToken,
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
  isLegacyBcryptHash
};
