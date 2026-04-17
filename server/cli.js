#!/usr/bin/env node
'use strict';

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const cmd = args[0];

const SERVER_DIR = __dirname;
const PROJECT_DIR = path.join(SERVER_DIR, '..');

// Colors
const g = '\x1b[32m';  // green
const y = '\x1b[33m';  // yellow
const c = '\x1b[36m';  // cyan
const r = '\x1b[0m';   // reset
const b = '\x1b[1m';   // bold
const d = '\x1b[2m';   // dim

function banner() {
  console.log('');
  console.log(`  ${g}${b}Eon Chat${r}  ${d}v1.0.0${r}`);
  console.log(`  ${d}Claude Code, from your pocket.${r}`);
  console.log('');
}

function checkClaude() {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkClaudeAuth() {
  try {
    const out = execSync('claude auth status', { encoding: 'utf8', stdio: 'pipe' });
    const data = JSON.parse(out);
    return data.loggedIn ? data : null;
  } catch {
    return null;
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

if (cmd === 'start' || !cmd) {
  banner();

  // Check Claude
  if (!checkClaude()) {
    console.log(`  ${y}Claude Code not found.${r}`);
    console.log(`  Install: ${c}npm install -g @anthropic-ai/claude-code${r}`);
    process.exit(1);
  }

  const auth = checkClaudeAuth();
  if (!auth) {
    console.log(`  ${y}Claude not authenticated.${r}`);
    console.log(`  Run: ${c}claude login${r}`);
    process.exit(1);
  }

  console.log(`  ${g}Logged in as${r} ${auth.email}`);
  console.log(`  ${g}Starting server...${r}`);
  console.log('');

  // Set dev license for now
  if (!process.env.EON_LICENSE) {
    process.env.EON_LICENSE = 'dev';
  }

  require('./index.js');

} else if (cmd === 'activate') {
  const key = args[1];
  if (!key) {
    console.log('Usage: eon-chat activate <license-key>');
    process.exit(1);
  }

  const os = require('os');
  const dataDir = process.env.EON_DATA_DIR || path.join(os.homedir(), '.eon-chat');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const licenseFile = path.join(dataDir, 'license.json');
  fs.writeFileSync(licenseFile, JSON.stringify({ key, status: 'valid' }, null, 2));
  console.log(`License saved to ${licenseFile}`);

} else if (cmd === 'status') {
  banner();

  const hasClaude = checkClaude();
  console.log(`  Claude CLI:  ${hasClaude ? g + 'installed' : y + 'not found'}${r}`);

  if (hasClaude) {
    const auth = checkClaudeAuth();
    console.log(`  Auth:        ${auth ? g + auth.email : y + 'not logged in'}${r}`);
    if (auth) {
      console.log(`  Plan:        ${auth.subscriptionType || 'unknown'}`);
    }
  }

  const os = require('os');
  const licenseFile = path.join(os.homedir(), '.eon-chat', 'license.json');
  if (fs.existsSync(licenseFile)) {
    try {
      const lic = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
      console.log(`  License:     ${lic.status === 'valid' ? g + 'active' : y + lic.status}${r}`);
    } catch {
      console.log(`  License:     ${y}corrupt${r}`);
    }
  } else {
    console.log(`  License:     ${d}none (trial)${r}`);
  }

  console.log('');

} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  banner();
  console.log('  Commands:');
  console.log(`    ${c}eon-chat${r}              Start the server`);
  console.log(`    ${c}eon-chat start${r}         Start the server`);
  console.log(`    ${c}eon-chat activate KEY${r}  Activate a license key`);
  console.log(`    ${c}eon-chat status${r}        Show system status`);
  console.log(`    ${c}eon-chat help${r}          Show this help`);
  console.log('');

} else {
  console.log(`Unknown command: ${cmd}. Run 'eon-chat help' for usage.`);
  process.exit(1);
}
