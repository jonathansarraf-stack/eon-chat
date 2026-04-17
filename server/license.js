'use strict';

/**
 * License verification module for Eon Chat.
 *
 * Flow:
 * 1. User signs up at eon-chat portal (Stripe Checkout)
 * 2. Receives a license key (stored in ~/.eon-chat/license.json)
 * 3. Server verifies license on startup and periodically
 *
 * For development/self-hosting, license check can be bypassed with
 * EON_LICENSE=dev environment variable.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = process.env.EON_DATA_DIR || path.join(require('os').homedir(), '.eon-chat');
const LICENSE_FILE = path.join(DATA_DIR, 'license.json');
const VERIFY_URL = process.env.EON_LICENSE_URL || 'https://api.eon.chat/v1/license/verify';

// License states
const STATUS = {
  VALID: 'valid',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  TRIAL: 'trial',
  DEV: 'dev',
  UNCHECKED: 'unchecked',
};

let currentStatus = STATUS.UNCHECKED;
let licenseData = null;

/**
 * Read the local license file.
 */
function readLicense() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    }
  } catch (e) {
    // corrupt file
  }
  return null;
}

/**
 * Save license data locally.
 */
function saveLicense(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Verify a license key against the remote server.
 */
function verifyRemote(key) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ key });
    const url = new URL(VERIFY_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ valid: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', () => resolve({ valid: false, error: 'Network error' }));
    req.on('timeout', () => { req.destroy(); resolve({ valid: false, error: 'Timeout' }); });
    req.write(body);
    req.end();
  });
}

/**
 * Check license status. Returns current status object.
 */
async function checkLicense() {
  // Dev mode bypass
  if (process.env.EON_LICENSE === 'dev') {
    currentStatus = STATUS.DEV;
    licenseData = { status: STATUS.DEV, email: 'dev@localhost' };
    return licenseData;
  }

  const local = readLicense();

  if (!local || !local.key) {
    // No license — grant 14-day trial from first run
    if (!local) {
      const trialData = {
        status: STATUS.TRIAL,
        trialStart: Date.now(),
        trialEnd: Date.now() + 14 * 24 * 60 * 60 * 1000,
      };
      saveLicense(trialData);
      currentStatus = STATUS.TRIAL;
      licenseData = trialData;
      return licenseData;
    }

    // Check if trial expired
    if (local.status === STATUS.TRIAL) {
      if (Date.now() < (local.trialEnd || 0)) {
        currentStatus = STATUS.TRIAL;
        licenseData = local;
        return licenseData;
      } else {
        currentStatus = STATUS.EXPIRED;
        licenseData = { ...local, status: STATUS.EXPIRED };
        return licenseData;
      }
    }

    currentStatus = STATUS.INVALID;
    licenseData = { status: STATUS.INVALID };
    return licenseData;
  }

  // Has a key — verify remotely
  const remote = await verifyRemote(local.key);

  if (remote.valid) {
    const updated = {
      ...local,
      status: STATUS.VALID,
      email: remote.email || local.email,
      plan: remote.plan || local.plan,
      expiresAt: remote.expiresAt || local.expiresAt,
      lastVerified: Date.now(),
    };
    saveLicense(updated);
    currentStatus = STATUS.VALID;
    licenseData = updated;
  } else {
    // If we verified successfully before and it's within grace period (7 days)
    if (local.lastVerified && Date.now() - local.lastVerified < 7 * 24 * 60 * 60 * 1000) {
      currentStatus = local.status === STATUS.VALID ? STATUS.VALID : STATUS.EXPIRED;
      licenseData = local;
    } else {
      currentStatus = STATUS.EXPIRED;
      licenseData = { ...local, status: STATUS.EXPIRED };
      saveLicense(licenseData);
    }
  }

  return licenseData;
}

/**
 * Activate a license key.
 */
async function activateLicense(key) {
  const remote = await verifyRemote(key);

  if (remote.valid) {
    const data = {
      key,
      status: STATUS.VALID,
      email: remote.email || '',
      plan: remote.plan || 'pro',
      expiresAt: remote.expiresAt,
      activatedAt: Date.now(),
      lastVerified: Date.now(),
    };
    saveLicense(data);
    currentStatus = STATUS.VALID;
    licenseData = data;
    return { ok: true, data };
  }

  return { ok: false, error: remote.error || 'Invalid key' };
}

/**
 * Get current license status without re-checking.
 */
function getStatus() {
  return { status: currentStatus, ...licenseData };
}

/**
 * Express middleware — block requests if license is expired.
 * Only blocks /api/sessions/:id/chat (actual Claude usage).
 * Other endpoints stay accessible.
 */
function requireLicense(req, res, next) {
  // Always allow in dev mode
  if (process.env.EON_LICENSE === 'dev') return next();

  // Allow health, auth, license endpoints
  if (req.path.startsWith('/api/health') ||
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/license')) {
    return next();
  }

  // Only gate chat endpoint
  if (req.path.includes('/chat')) {
    if (currentStatus === STATUS.EXPIRED || currentStatus === STATUS.INVALID) {
      return res.status(402).json({
        error: 'license_expired',
        message: 'Your Eon Chat license has expired. Renew at https://eon.chat/pricing',
      });
    }
  }

  next();
}

module.exports = {
  checkLicense,
  activateLicense,
  getStatus,
  requireLicense,
  STATUS,
};
