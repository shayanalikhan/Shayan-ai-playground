const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { collectSnapshot } = require('./collector');

const HOST = process.env.MONITOR_HOST || '127.0.0.1';
const PORT = Number(process.env.MONITOR_PORT || 18890);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(res, filePath) {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch (error) {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === '/api/snapshot') {
    try {
      const snapshot = collectSnapshot();
      return sendJson(res, 200, snapshot);
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'snapshot failed' });
    }
  }

  if (url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, host: HOST, port: PORT });
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  return sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Server monitor dashboard running at http://${HOST}:${PORT}\n`);
});
