'use strict';

const { execSync } = require('child_process');

/**
 * Gets the current Claude authentication status.
 * Returns user info if logged in, or null if not.
 */
function getAuthStatus() {
  try {
    const output = execSync('claude auth status', {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env },
    });
    const data = JSON.parse(output);
    if (data.loggedIn) {
      return {
        loggedIn: true,
        email: data.email || '',
        orgName: data.orgName || '',
        subscriptionType: data.subscriptionType || 'free',
        authMethod: data.authMethod || 'unknown',
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { getAuthStatus };
