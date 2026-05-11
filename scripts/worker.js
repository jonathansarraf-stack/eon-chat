'use strict';

const config = require('../src/config');
const { processNextRun } = require('../src/services/execution-service');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[worker] starting');

  for (;;) {
    try {
      const result = await processNextRun();
      if (!result) {
        await sleep(config.runIdleSleepMs);
        continue;
      }

      console.log(`[worker] processed run ${result.runId} with status ${result.status}`);
      await sleep(config.runPollIntervalMs);
    } catch (error) {
      console.error('[worker] fatal loop error', error);
      await sleep(config.runIdleSleepMs);
    }
  }
}

main().catch((error) => {
  console.error('[worker] crash', error);
  process.exitCode = 1;
});
