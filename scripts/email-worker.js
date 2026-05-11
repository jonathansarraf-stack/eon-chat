'use strict';

const config = require('../src/config');
const { processNextEmail } = require('../src/services/email-delivery-service');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[email-worker] starting');

  for (;;) {
    try {
      const result = await processNextEmail();
      if (!result) {
        await sleep(config.emailPollIntervalMs);
        continue;
      }

      console.log(`[email-worker] processed ${result.emailId} with status ${result.status}`);
      await sleep(config.emailPollIntervalMs);
    } catch (error) {
      console.error('[email-worker] fatal loop error', error);
      await sleep(config.emailPollIntervalMs);
    }
  }
}

main().catch((error) => {
  console.error('[email-worker] crash', error);
  process.exitCode = 1;
});
