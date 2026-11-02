/* Califest TV server
   - Serves the website and the admin dashboard
   - Provides a password-protected API that saves data/config.json and data/content.json
   Run:  ADMIN_PASSWORD="your-strong-password" node server.js
   Zero dependencies. Needs Node 18+. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'califest-admin';
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expiry timestamp

const DATA_FILES = { config: 'config.json', content: 'content.json' };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD is not set. The default password is in use. Set it before going live.');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(payload);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAuthed(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function checkPassword(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validate(name, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'Data must be a JSON object.';
  if (name === 'config' && !obj.streamConfig) return 'streamConfig is required.';
  if (name === 'content') {
    for (const key of ['channels', 'shows', 'highlights', 'events', 'packages']) {
      if (!Array.isArray(obj[key])) return `"${key}" must be a list.`;
    }
  }
  return null;
}

async function handleApi(req, res, pathname) {
  // Login: exchange the admin password for a session token
  if (pathname === '/api/login' && req.method === 'POST') {
    let input = {};
    try {
      input = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return send(res, 400, { error: 'Invalid request.' });
    }
    if (!checkPassword(input.password)) return send(res, 401, { error: 'Wrong password.' });

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { token });
  }

  // Session check used by the dashboard on load
  if (pathname === '/api/session') {
    return isAuthed(req) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'Not logged in.' });
  }

  // Read or save the two data files
  const match = pathname.match(/^\/api\/data\/(config|content)$/);
  if (!match) return send(res, 404, { error: 'Not found.' });

  const name = match[1];
  const file = path.join(ROOT, 'data', DATA_FILES[name]);

  if (req.method === 'GET') {
    try {
      return send(res, 200, fs.readFileSync(file, 'utf8'), 'application/json; charset=utf-8');
    } catch {
      return send(res, 500, { error: 'Could not read the data file.' });
    }
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req)) return send(res, 401, { error: 'Not logged in.' });

    let obj;
    try {
      obj = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, 400, { error: err.message === 'Payload too large' ? err.message : 'Invalid JSON.' });
    }

    const problem = validate(name, obj);
    if (problem) return send(res, 422, { error: problem });

    // Keep a backup of the previous version, then write atomically
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);

    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method not allowed.' });
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel === 'admin' || rel === 'admin/') rel = 'admin/index.html';

  const file = path.normalize(path.join(ROOT, rel));
  const blocked =
    file === path.join(ROOT, 'server.js') ||
    path.basename(file).startsWith('.') ||
    /\.(bak|tmp)$/i.test(file);

  if (!file.startsWith(ROOT + path.sep) || blocked) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }

  fs.readFile(file, (err, buffer) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    send(res, 200, buffer, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Califest TV running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at    http://localhost:${PORT}/admin`);
});