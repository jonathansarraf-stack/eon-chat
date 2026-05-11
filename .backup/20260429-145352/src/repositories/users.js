'use strict';

async function findUserByEmail(db, email) {
  const result = await db.query(
    `select id, email, name, password_hash, global_role, email_verified_at, created_at, last_login_at
     from users where lower(email) = lower($1)`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(db, userId) {
  const result = await db.query(
    `select id, email, name, global_role, email_verified_at, created_at, last_login_at
     from users where id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function createUser(db, { email, name, passwordHash }) {
  const result = await db.query(
    `insert into users (email, name, password_hash, email_verified_at)
     values (lower($1), $2, $3, null)
     returning id, email, name, global_role, email_verified_at, created_at, last_login_at`,
    [email, name || null, passwordHash]
  );
  return result.rows[0];
}

async function touchLastLogin(db, userId) {
  await db.query('update users set last_login_at = now() where id = $1', [userId]);
}

async function createEmailVerificationToken(db, { userId, email, verificationTokenHash, expiresAt }) {
  const result = await db.query(
    `insert into email_verification_tokens (user_id, email, verification_token_hash, expires_at)
     values ($1, lower($2), $3, $4)
     returning id, user_id, email, verification_token_hash, expires_at, consumed_at, created_at`,
    [userId, email, verificationTokenHash, expiresAt]
  );
  return result.rows[0];
}

async function findEmailVerificationToken(db, verificationTokenHash) {
  const result = await db.query(
    `select id, user_id, email, verification_token_hash, expires_at, consumed_at, created_at
     from email_verification_tokens
     where verification_token_hash = $1`,
    [verificationTokenHash]
  );
  return result.rows[0] || null;
}

async function consumeEmailVerificationToken(db, tokenId) {
  await db.query(
    'update email_verification_tokens set consumed_at = now() where id = $1 and consumed_at is null',
    [tokenId]
  );
}

async function setEmailVerified(db, userId) {
  const result = await db.query(
    `update users
     set email_verified_at = coalesce(email_verified_at, now())
     where id = $1
     returning id, email, name, global_role, email_verified_at, created_at, last_login_at`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  touchLastLogin,
  createEmailVerificationToken,
  findEmailVerificationToken,
  consumeEmailVerificationToken,
  setEmailVerified
};
