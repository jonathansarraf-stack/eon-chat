'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { withTransaction } = require('../db');
const notificationsRepo = require('../repositories/notifications');

function ensureDir(dirpath) {
  fs.mkdirSync(dirpath, { recursive: true });
}

function renderTemplate(email) {
  const payload = email.payload_json || {};

  if (email.template === 'email_verification') {
    return {
      text: [
        `Hello ${payload.name || ''}`.trim(),
        '',
        'Verify your Eon Chat email by opening the link below:',
        payload.verifyUrl || '',
        '',
        `From: ${config.emailFromAddress}`
      ].join('\n')
    };
  }

  if (email.template === 'tenant_invite') {
    return {
      text: [
        `You have been invited to join ${payload.tenantName || 'an Eon Chat workspace'}.`,
        `Role: ${payload.role || 'member'}`,
        '',
        'Open the invite link below to continue:',
        payload.inviteUrl || '',
        '',
        `From: ${config.emailFromAddress}`
      ].join('\n')
    };
  }

  return {
    text: JSON.stringify(payload, null, 2)
  };
}

function persistDeliveryArtifact(email, rendered) {
  ensureDir(config.emailRuntimeDir);
  const filepath = path.join(config.emailRuntimeDir, `${email.id}.json`);
  const artifact = {
    id: email.id,
    kind: email.kind,
    to: email.to_email,
    subject: email.subject,
    template: email.template,
    payload: email.payload_json || {},
    rendered,
    deliveredAt: new Date().toISOString(),
    mode: config.emailDeliveryMode,
    from: config.emailFromAddress
  };
  fs.writeFileSync(filepath, JSON.stringify(artifact, null, 2));
  return filepath;
}

async function deliverEmail(email) {
  const rendered = renderTemplate(email);

  if (config.emailDeliveryMode === 'disabled') {
    return {
      deliveryMode: 'disabled',
      rendered,
      artifactPath: null
    };
  }

  const artifactPath = persistDeliveryArtifact(email, rendered);
  console.log(`[email-worker] delivered ${email.id} to ${email.to_email} via ${config.emailDeliveryMode}`);

  return {
    deliveryMode: config.emailDeliveryMode,
    rendered,
    artifactPath
  };
}

async function processNextEmail() {
  return withTransaction(async (db) => {
    const email = await notificationsRepo.claimNextPendingEmail(db);
    if (!email) return null;

    try {
      const delivery = await deliverEmail(email);
      await notificationsRepo.markEmailSent(db, email.id);
      return {
        emailId: email.id,
        status: 'sent',
        artifactPath: delivery.artifactPath,
        deliveryMode: delivery.deliveryMode
      };
    } catch (error) {
      await notificationsRepo.markEmailFailed(db, email.id, error.message);
      return {
        emailId: email.id,
        status: 'failed',
        error: error.message
      };
    }
  });
}

module.exports = {
  renderTemplate,
  processNextEmail
};
