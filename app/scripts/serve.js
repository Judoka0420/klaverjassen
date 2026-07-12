#!/usr/bin/env node
/* Tiny zero-dependency static server for local browser testing of www/.
   Usage: node scripts/serve.js [port]   (default 5599)
   Open http://localhost:<port> — localhost is a secure context, so PeerJS/WebRTC work. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +(process.argv[2] || process.env.PORT || 5599);
const ROOT = path.resolve(__dirname, '..', 'www');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 ' + urlPath); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('\n  Klaverjassen (app/www) served at:  http://localhost:' + PORT + '\n');
});
