#!/usr/bin/env node
// Static server for trying the site locally.
//
//   node tools/serve.js            serves public/ on http://localhost:8080
//   node tools/serve.js --mock     same, plus a local copy of the backend
//                                  (backend/Code.gs running on in-memory fakes;
//                                  teacher password "lehrer123", data is lost on exit)
//
// In --mock mode two helper URLs simulate a dead backend for testing the retry logic:
//   http://localhost:8080/__mock/down   and   http://localhost:8080/__mock/up

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const args = process.argv.slice(2);
const MOCK = args.includes('--mock');
const PORT = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

let backend = null;
let down = false;
if (MOCK) {
  const { createBackend } = await import('./gas-mock.js');
  backend = createBackend();
  backend.setup('lehrer123');
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);

  if (MOCK) {
    if (p === '/__mock/down' || p === '/__mock/up') {
      down = p.endsWith('down');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(down ? 'Backend simuliert: AUS' : 'Backend simuliert: AN');
      return;
    }
    if (p === '/config.json') {
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' })
        .end(JSON.stringify({ endpoint: 'mock-api', token: backend.token() }));
      return;
    }
    if (p === '/mock-api' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (down) { req.socket.destroy(); return; }
        const out = backend.post(body);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(JSON.stringify(out));
      });
      return;
    }
  }

  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Schülerseite: http://localhost:${PORT}/`);
  console.log(`Lehrerseite:  http://localhost:${PORT}/lehrer.html`);
  if (MOCK) console.log('Mock-Backend aktiv — Lehrer-Passwort: lehrer123 (Daten nur im Speicher)');
});
