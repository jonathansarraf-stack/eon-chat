'use strict';

const config = require('../config');
const { withTransaction, getPool } = require('../db');
const { randomToken, hashToken, hashPassword, verifyPassword } = require('../crypto');
const { badRequest, unauthorized } = require('../errors');
const usersRepo = require('../repositories/users');
const sessionsRepo = require('../repositories/sessions');
const notificationsRepo = require('../repositories/notifications');
const { acceptInviteForUser } = require('./member-service');

function sessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + config.sessionTtlDays);
  return expiresAt;
}

function verificationExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 2);
  return expiresAt;
}

async function queueVerificationEmail(db, user) {
  const rawToken = randomToken();
  const verification = await usersRepo.createEmailVerificationToken(db, {
    userId: user.id,
    email: user.email,
    verificationTokenHash: hashToken(rawToken),
    expiresAt: verificationExpiryDate()
  });
  const verifyUrl = `${config.publicBaseUrl}/?verify=${encodeURIComponent(rawToken)}`;
  await notificationsRepo.createEmailOutboxEntry(db, {
    kind: 'email_verification',
    toEmail: user.email,
    subject: 'Verify your Eon Chat email',
    template: 'email_verification',
    payload: {
      userId: user.id,
      name: user.name || '',
      verifyUrl
    }
  });
  return {
    token: rawToken,
    verifyUrl,
    expiresAt: verification.expires_at
  };
}

async function signUp({ email, password, name, ipAddress, userAgent, inviteToken }) {
  if (!email || !password) {
    throw badRequest('missing_credentials', 'email and password are required');
  }
  if (password.length < 8) {
    throw badRequest('weak_password', 'password must be at least 8 characters');
  }

  const pool = getPool();
  const existing = await usersRepo.findUserByEmail(pool, email);
  if (existing) {
    throw badRequest('email_in_use', 'email already in use');
  }

  const passwordHash = await hashPassword(password);

  const result = await withTransaction(async (db) => {
    const user = await usersRepo.createUser(db, { email, name, passwordHash });
    const rawToken = randomToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = sessionExpiryDate();
    await sessionsRepo.createSession(db, {
      userId: user.id,
      sessionTokenHash: hashedToken,
      expiresAt,
      ipAddress,
      userAgent
    });
    const acceptedInvite = inviteToken
      ? await acceptInviteForUser({ db, user, inviteToken })
      : null;
    const emailVerification = await queueVerificationEmail(db, user);
    return { user, sessionToken: rawToken, expiresAt, acceptedInvite, emailVerification };
  });

  return result;
}

async function signIn({ email, password, ipAddress, userAgent }) {
  if (!email || !password) {
    throw badRequest('missing_credentials', 'email and password are required');
  }

  const pool = getPool();
  const user = await usersRepo.findUserByEmail(pool, email);
  if (!user || !user.password_hash) {
    throw unauthorized('invalid_credentials', 'invalid email or password');
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw unauthorized('invalid_credentials', 'invalid email or password');
  }

  const result = await withTransaction(async (db) => {
    await usersRepo.touchLastLogin(db, user.id);
    const rawToken = randomToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = sessionExpiryDate();
    await sessionsRepo.createSession(db, {
      userId: user.id,
      sessionTokenHash: hashedToken,
      expiresAt,
      ipAddress,
      userAgent
    });
    const freshUser = await usersRepo.findUserById(db, user.id);
    return { user: freshUser, sessionToken: rawToken, expiresAt };
  });

  return result;
}

async function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const pool = getPool();
  const session = await sessionsRepo.getSessionWithUser(pool, hashToken(rawToken));
  if (!session) return null;
  await sessionsRepo.touchSession(pool, hashToken(rawToken));
  return {
    sessionId: session.session_id,
    expiresAt: session.expires_at,
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      globalRole: session.global_role,
      emailVerifiedAt: session.email_verified_at
    }
  };
}

async function signOut(rawToken) {
  if (!rawToken) return;
  await sessionsRepo.deleteSession(getPool(), hashToken(rawToken));
}

async function requestEmailVerification({ user }) {
  if (!user?.id || !user?.email) {
    throw unauthorized('auth_required', 'authentication required');
  }

  return withTransaction(async (db) => {
    const freshUser = await usersRepo.findUserById(db, user.id);
    if (!freshUser) {
      throw unauthorized('auth_required', 'authentication required');
    }
    if (freshUser.email_verified_at) {
      return {
        alreadyVerified: true,
        emailVerification: null
      };
    }
    const emailVerification = await queueVerificationEmail(db, freshUser);
    return {
      alreadyVerified: false,
      emailVerification
    };
  });
}

async function verifyEmail({ verificationToken }) {
  if (!verificationToken) {
    throw badRequest('verification_token_required', 'verification token is required');
  }

  return withTransaction(async (db) => {
    const token = await usersRepo.findEmailVerificationToken(db, hashToken(verificationToken));
    if (!token) {
      throw badRequest('verification_token_invalid', 'verification token is invalid');
    }
    if (token.consumed_at) {
      throw badRequest('verification_token_consumed', 'verification token has already been used');
    }
    if (new Date(token.expires_at).getTime() <= Date.now()) {
      throw badRequest('verification_token_expired', 'verification token has expired');
    }

    const user = await usersRepo.setEmailVerified(db, token.user_id);
    await usersRepo.consumeEmailVerificationToken(db, token.id);

    return {
      user
    };
  });
}

module.exports = {
  signUp,
  signIn,
  signOut,
  getSessionUser,
  requestEmailVerification,
  verifyEmail
};
