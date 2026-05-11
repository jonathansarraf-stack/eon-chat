'use strict';

async function createEmailOutboxEntry(db, { kind, toEmail, subject, template, payload, scheduledAt }) {
  const result = await db.query(
    `insert into email_outbox (kind, to_email, subject, template, payload_json, scheduled_at)
     values ($1, lower($2), $3, $4, $5::jsonb, $6)
     returning id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at`,
    [
      kind,
      toEmail,
      subject,
      template,
      JSON.stringify(payload || {}),
      scheduledAt || new Date()
    ]
  );
  return result.rows[0];
}

async function claimNextPendingEmail(db) {
  const result = await db.query(
    `select id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at
       from email_outbox
       where status = 'pending' and scheduled_at <= now()
       order by scheduled_at asc, created_at asc
       limit 1
       for update skip locked`
  );
  return result.rows[0] || null;
}

async function markEmailSent(db, emailId) {
  const result = await db.query(
    `update email_outbox
     set status = 'sent',
         sent_at = coalesce(sent_at, now())
     where id = $1
     returning id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at`,
    [emailId]
  );
  return result.rows[0] || null;
}

async function markEmailFailed(db, emailId, errorMessage) {
  const result = await db.query(
    `update email_outbox
     set status = 'failed',
         payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('lastError', $2),
         sent_at = null
     where id = $1
     returning id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at`,
    [emailId, String(errorMessage || 'delivery_failed')]
  );
  return result.rows[0] || null;
}

async function getEmailOutboxEntryById(db, emailId) {
  const result = await db.query(
    `select id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at
     from email_outbox
     where id = $1`,
    [emailId]
  );
  return result.rows[0] || null;
}

async function summarizeEmailOutbox(db) {
  const result = await db.query(
    `select
       count(*)::int as total,
       count(*) filter (where status = 'pending')::int as pending,
       count(*) filter (where status = 'sent')::int as sent,
       count(*) filter (where status = 'failed')::int as failed,
       min(scheduled_at) filter (where status = 'pending') as oldest_pending_at
     from email_outbox`
  );
  return result.rows[0];
}

async function listRecentProblemEmails(db, limit = 5) {
  const result = await db.query(
    `select id, kind, to_email, subject, template, payload_json, status, scheduled_at, sent_at, created_at
     from email_outbox
     where status = 'failed'
     order by created_at desc
     limit $1`,
    [limit]
  );
  return result.rows;
}

module.exports = {
  createEmailOutboxEntry,
  claimNextPendingEmail,
  markEmailSent,
  markEmailFailed,
  getEmailOutboxEntryById,
  summarizeEmailOutbox,
  listRecentProblemEmails
};
