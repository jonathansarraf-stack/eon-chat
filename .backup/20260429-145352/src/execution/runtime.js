'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

function safeSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function runtimeDirForRun(run) {
  return path.join(
    config.runtimeRootDir,
    'tenants',
    safeSegment(run.tenant_id),
    'workspaces',
    safeSegment(run.workspace_id),
    'runs',
    safeSegment(run.id)
  );
}

function prepareRuntimeDir(run) {
  return ensureDir(runtimeDirForRun(run));
}

function writeRuntimeFile(runtimeDir, filename, content) {
  const fullPath = path.join(runtimeDir, filename);
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

module.exports = {
  prepareRuntimeDir,
  writeRuntimeFile
};
