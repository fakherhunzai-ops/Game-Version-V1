import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const useDist = process.argv.includes('--dist');
const root = resolve(projectRoot, useDist ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendFile(response, path, method) {
  let stat;
  try { stat = statSync(path); } catch { return false; }
  if (!stat.isFile()) return false;
  const type = mimeTypes[extname(path).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': useDist ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (method === 'HEAD') { response.end(); return true; }
  createReadStream(path).pipe(response);
  return true;
}

const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { 'Allow': 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  if (sendFile(response, candidate, request.method)) return;
  // SPA fallback only for extensionless routes; static asset misses remain true 404s.
  if (!extname(pathname) && sendFile(response, resolve(root, 'index.html'), request.method)) return;
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`LAST ZONE preview listening on http://0.0.0.0:${port}${useDist ? ' (dist)' : ''}`);
});
