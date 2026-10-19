import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const host = '127.0.0.1';
const port = 4173;
const dummyToken = 'dummy-token-not-real';
const dummyPassword = 'dummy-password-not-real';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);

  if (request.method === 'GET' && url.pathname === '/api/items') {
    sendJson(response, 200, {
      items: [{ id: 'widget', name: 'Demo widget', query: url.searchParams.get('q') ?? '' }],
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/missing') {
    sendJson(response, 404, { error: 'not found' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/boom') {
    sendJson(response, 500, { error: 'demo failure' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session') {
    const raw = await readBody(request);
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const authorization = request.headers.authorization ?? '';
    const password = parsed && typeof parsed === 'object' ? parsed.password : '';
    const username = parsed && typeof parsed === 'object' && typeof parsed.username === 'string' ? parsed.username : '';
    const authorized = authorization === `Bearer ${dummyToken}` && password === dummyPassword;
    if (!authorized) {
      sendJson(response, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    sendJson(
      response,
      200,
      { ok: true, user: username || 'demo-user' },
      { 'Set-Cookie': 'session=dummy-session-value; HttpOnly; Path=/' },
    );
    return;
  }

  const requested = (url.pathname === '/' ? 'index.html' : url.pathname).replace(/^[/\\]+/, '');
  if (requested.includes('..')) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }
  const filePath = normalize(join(root, requested));
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'not found' });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`RequestReplay demo at http://${host}:${port}\n`);
});
