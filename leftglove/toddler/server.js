const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); }
  catch { return 'unknown'; }
})();
const STARTED = new Date().toISOString();

const PORT = process.env.PORT || 8080;
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure sessions/ exists
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
};

function slugify(url) {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').substring(0, 80);
  } catch (e) { return 'unknown'; }
}

const server = http.createServer((req, res) => {
  // CORS for all
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // GET /healthz
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', commit: COMMIT, started: STARTED, service: 'toddler-ui' }));
    return;
  }

  // POST /save
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const sourceUrl = data?.source?.url || 'unknown';
        const slug = slugify(sourceUrl);
        const ts = data?.source?.timestamp
          ? data.source.timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
          : String(Date.now());
        const filename = `${slug}-${ts}.json`;
        const filepath = path.join(SESSIONS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ saved: filename }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /sessions — list saved sessions
  if (req.method === 'GET' && req.url === '/sessions') {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
    return;
  }

  // Static file serving
  let urlPath = req.url.split('?')[0]; // strip query params
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`[toddler] Server on http://localhost:${PORT}`);
  console.log(`[toddler] Sessions dir: ${SESSIONS_DIR}`);
});
