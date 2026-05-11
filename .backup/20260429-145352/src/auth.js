'use strict';

const config = require('./config');
const { parseCookies } = require('./cookies');
const { getSessionUser } = require('./services/auth-service');
const { unauthorized, forbidden } = require('./errors');

async function optionalUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[config.sessionCookieName];

    if (rawToken) {
      req.context.sessionToken = rawToken;
      const session = await getSessionUser(rawToken);
      if (session) {
        req.context.user = session.user;
        req.context.session = {
          id: session.sessionId,
          expiresAt: session.expiresAt
        };
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

function requireUser(req, _res, next) {
  if (!req.context.user) {
    const error = unauthorized('auth_required', 'authentication required');
    if (typeof next === 'function') return next(error);
    throw error;
  }
  if (typeof next === 'function') next();
}

function requireVerifiedUser(req, _res, next) {
  requireUser(req);
  if (!req.context.user?.emailVerifiedAt) {
    const error = forbidden('email_verification_required', 'email verification is required');
    if (typeof next === 'function') return next(error);
    throw error;
  }
  if (typeof next === 'function') next();
}

module.exports = {
  optionalUser,
  requireUser,
  requireVerifiedUser
};
