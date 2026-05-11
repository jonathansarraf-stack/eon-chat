'use strict';

async function createSession(db, { userId, sessionTokenHash, expiresAt, ipAddress, userAgent }) {
  const result = await db.query(
    `insert into user_sessions (user_id, session_token_hash, expires_at, ip_address, user_agent)
     values ($1, $2, $3, $4, $5)
     returning id, user_id, expires_at, created_at, last_seen_at`,
    [userId, sessionTokenHash, expiresAt, ipAddress || null, userAgent || null]
  );
  return result.rows[0];
}

async function getSessionWithUser(db, sessionTokenHash) {
  const result = await db.query(
    `select
       s.id as session_id,
       s.expires_at,
       u.id as user_id,
       u.email,
       u.name,
       u.global_role,
       u.email_verified_at
     from user_sessions s
     join users u on u.id = s.user_id
     where s.session_token_hash = $1 and s.expires_at > now()`,
    [sessionTokenHash]
  );
  return result.rows[0] || null;
}

async function touchSession(db, sessionTokenHash) {
  await db.query(
    'update user_sessions set last_seen_at = now() where session_token_hash = $1',
    [sessionTokenHash]
  );
}

async function deleteSession(db, sessionTokenHash) {
  await db.query('delete from user_sessions where session_token_hash = $1', [sessionTokenHash]);
}

module.exports = {
  createSession,
  getSessionWithUser,
  touchSession,
  deleteSession
};
