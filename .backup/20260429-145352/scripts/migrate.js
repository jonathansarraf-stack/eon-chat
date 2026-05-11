'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { getPool } = require('../src/db');

async function ensureMigrationsTable(pool) {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedVersions(pool) {
  const result = await pool.query('select version from schema_migrations');
  return new Set(result.rows.map((row) => row.version));
}

function migrationFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({
      version: name,
      filepath: path.join(dir, name)
    }));
}

async function run() {
  const pool = getPool();
  await ensureMigrationsTable(pool);
  const seen = await appliedVersions(pool);
  const files = migrationFiles(config.migrationsDir);

  for (const file of files) {
    if (seen.has(file.version)) continue;
    const sql = fs.readFileSync(file.filepath, 'utf8');
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations(version) values ($1)', [file.version]);
      await pool.query('commit');
      console.log(`[migrate] applied ${file.version}`);
    } catch (err) {
      await pool.query('rollback');
      throw err;
    }
  }

  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
