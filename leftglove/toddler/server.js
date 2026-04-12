const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env if present (no dependency needed)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq < 0) return;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    });
  }
} catch (_) {}

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

// ── LLM auto-classify ──────────────��────────────────────────────────────────

function callAnthropic(apiKey, messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });
    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Failed to parse Anthropic response: ' + body.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function handleAutoClassify(data, apiKey) {
  const { screenshotB64, elements, pageUrl, batchStart, batchEnd } = data;
  if (!elements || !elements.length) throw new Error('No elements provided');

  // Build element descriptions for the prompt
  const elementDescs = elements.map((el, i) => {
    const parts = [`[${el.index}] <${el.tag}>`,];
    if (el.elementType) parts.push(`type="${el.elementType}"`);
    if (el.label) parts.push(`label="${el.label}"`);
    if (el.visibleText) parts.push(`text="${el.visibleText.slice(0, 80)}"`);
    if (el.ariaRole) parts.push(`role="${el.ariaRole}"`);
    if (el.locators) {
      if (el.locators.testid) parts.push(`data-testid="${el.locators.testid}"`);
      if (el.locators.id) parts.push(`id="${el.locators.id}"`);
      if (el.locators.name) parts.push(`name="${el.locators.name}"`);
    }
    if (el.rect) parts.push(`rect=(${el.rect.x},${el.rect.y},${el.rect.w}x${el.rect.h})`);
    if (el.region) parts.push(`region="${el.region}"`);
    return parts.join(' ');
  });

  const systemPrompt = `You are classifying interactive elements on a web page for an AI agent vocabulary system.

For each element, you must decide:
1. CATEGORY: one of: clickable, typable, readable, selectable, chrome, skip
   - clickable: buttons, links, checkboxes, radio buttons — things you click
   - typable: text inputs, textareas, search boxes — things you type into
   - readable: prices, titles, status text, ratings — informational text the agent needs to read
   - selectable: dropdowns, select menus, date pickers — things with predefined options
   - chrome: navigation bars, footers, cookie banners, ads, decorative elements — page chrome the agent should ignore
   - skip: invisible elements, duplicates, or elements with no useful purpose

2. NAME: a short kebab-case glossary name (only if category is NOT chrome or skip)
   - e.g., "add-to-cart", "price", "search-button", "park-selector"
   - Names should be descriptive and unique within the page
   - Use the element's purpose, not its implementation

Respond ONLY with a JSON array. Each entry: {"index": <number>, "category": "<string>", "name": "<string or null>"}
No explanation, no markdown fences, just the JSON array.`;

  const userContent = [];

  // Add screenshot if provided
  if (screenshotB64) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: screenshotB64,
      },
    });
  }

  userContent.push({
    type: 'text',
    text: `Page URL: ${pageUrl || 'unknown'}
Elements to classify (batch ${batchStart !== undefined ? batchStart + '-' + batchEnd : 'all'} of ${elements.length}):

${elementDescs.join('\n')}

Classify each element. Respond with a JSON array only.`,
  });

  const response = await callAnthropic(apiKey, [{ role: 'user', content: userContent }], systemPrompt);

  // Extract text from response
  const text = response.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text)
    .join('') || '';

  // Parse JSON from response (handle potential markdown fences)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const classifications = JSON.parse(cleaned);
  return { classifications };
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // CORS for all
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // GET /healthz
  if (req.method === 'GET' && req.url === '/healthz') {
    jsonResponse(res, 200, { status: 'ok', commit: COMMIT, started: STARTED, service: 'toddler-ui' });
    return;
  }

  // POST /save
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    let errored = false;
    const MAX_BODY = 10 * 1024 * 1024; // 10 MB limit
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) {
        errored = true;
        req.destroy();
        jsonResponse(res, 413, { error: 'Request body too large' });
      }
    });
    req.on('error', () => {
      if (!errored) { errored = true; jsonResponse(res, 400, { error: 'request stream error' }); }
    });
    req.on('end', () => {
      if (errored) return;
      try {
        const data = JSON.parse(body);
        const sourceUrl = data?.source?.url || 'unknown';
        const slug = slugify(sourceUrl);
        const ts = data?.source?.timestamp
          ? data.source.timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
          : String(Date.now());
        const filename = `${slug}-${ts}.json`;
        const filepath = path.join(SESSIONS_DIR, filename);
        fs.writeFile(filepath, JSON.stringify(data, null, 2), (writeErr) => {
          if (writeErr) { jsonResponse(res, 500, { error: writeErr.message }); return; }
          jsonResponse(res, 200, { saved: filename });
        });
      } catch (e) {
        jsonResponse(res, 400, { error: e.message });
      }
    });
    return;
  }

  // GET /sessions — list saved sessions
  if (req.method === 'GET' && req.url === '/sessions') {
    fs.readdir(SESSIONS_DIR, (err, entries) => {
      if (err) { jsonResponse(res, 500, { error: err.message }); return; }
      const files = entries.filter(f => f.endsWith('.json')).sort().reverse();
      jsonResponse(res, 200, files);
    });
    return;
  }

  // POST /auto-classify — LLM-powered element classification
  if (req.method === 'POST' && req.url === '/auto-classify') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      jsonResponse(res, 500, { error: 'ANTHROPIC_API_KEY not set. Start server with: ANTHROPIC_API_KEY=sk-... node server.js' });
      return;
    }
    let body = '';
    let errored = false;
    const MAX_BODY = 50 * 1024 * 1024; // 50 MB (screenshots are large)
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) {
        errored = true;
        req.destroy();
        jsonResponse(res, 413, { error: 'Request body too large' });
      }
    });
    req.on('error', () => {
      if (!errored) { errored = true; jsonResponse(res, 400, { error: 'request stream error' }); }
    });
    req.on('end', () => {
      if (errored) return;
      try {
        const data = JSON.parse(body);
        handleAutoClassify(data, apiKey).then(result => {
          jsonResponse(res, 200, result);
        }).catch(err => {
          jsonResponse(res, 500, { error: err.message });
        });
      } catch (e) {
        jsonResponse(res, 400, { error: 'Invalid JSON: ' + e.message });
      }
    });
    return;
  }

  // Static file serving
  let urlPath = req.url.split('?')[0]; // strip query params
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  // Prevent directory traversal
  if (!filePath.startsWith(__dirname + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
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
