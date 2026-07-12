#!/usr/bin/env node
/* Copies the single-source game files + the PeerJS browser bundle into www/lib,
   so the app always ships the same engine/rules the server uses. Run before any
   Capacitor sync/build (wired into the npm scripts). */
'use strict';
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');
const libDir = path.join(appDir, 'www', 'lib');
fs.mkdirSync(libDir, { recursive: true });

function copy(src, dst, label) {
  if (!fs.existsSync(src)) { console.error('  MISSING: ' + src); process.exitCode = 1; return; }
  fs.copyFileSync(src, dst);
  console.log('  ✓ ' + label + '  ->  ' + path.relative(appDir, dst));
}

console.log('sync-assets:');
// Canonical rules engine + orchestrator (shared with the Node server).
copy(path.join(repoRoot, 'engine.js'), path.join(libDir, 'engine.js'), 'engine.js');
copy(path.join(repoRoot, 'game-room.js'), path.join(libDir, 'game-room.js'), 'game-room.js');

// PeerJS browser bundle (bundled locally — no CDN, so offline solo still loads).
const peerCandidates = [
  path.join(appDir, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'),
  path.join(repoRoot, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'),
];
const peer = peerCandidates.find(p => fs.existsSync(p));
if (peer) copy(peer, path.join(libDir, 'peerjs.min.js'), 'peerjs.min.js');
else { console.error('  MISSING peerjs dist — run `npm install` in app/ first.'); process.exitCode = 1; }
