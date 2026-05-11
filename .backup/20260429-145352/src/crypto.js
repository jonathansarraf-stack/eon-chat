'use strict';

const crypto = require('crypto');

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
  return new Promise((resolve, reject) => {
    if (!hash || !hash.includes(':')) return resolve(false);
    const [salt, stored] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(key.toString('hex'), 'hex')));
    });
  });
}

module.exports = {
  randomToken,
  hashToken,
  hashPassword,
  verifyPassword
};
