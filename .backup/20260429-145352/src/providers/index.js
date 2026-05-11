'use strict';

const { adapter: claudeCodeAdapter } = require('./claude-code');
const { adapter: codexAdapter } = require('./codex');

const registry = new Map([
  [claudeCodeAdapter.provider, claudeCodeAdapter],
  [codexAdapter.provider, codexAdapter]
]);

function getProviderAdapter(provider) {
  return registry.get(provider) || null;
}

function listProviderAdapters() {
  return Array.from(registry.values());
}

module.exports = {
  getProviderAdapter,
  listProviderAdapters
};
