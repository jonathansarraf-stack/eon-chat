'use strict';

const { Pool } = require('pg');
const config = require('./config');

let pool = null;

function getPool() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl
    });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  query,
  withTransaction
};
