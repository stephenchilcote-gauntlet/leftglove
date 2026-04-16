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


// ── LLM auto-classify (two-phase with prompt caching) ────────────────────

const CLASSIFY_SYSTEM = `You are building a vocabulary for an AI agent that will interact with this web page in the future.

For each element shown, decide:

1. CATEGORY — one of: clickable, typable, readable, chrome, skip

   clickable — buttons, links, checkboxes, radio buttons, toggles, tabs, menu items,
              dropdowns, select menus. Things an agent would click to act or navigate.

   typable — text inputs, search boxes, textareas, date fields.
            Things an agent would type into.

   readable — dynamic, task-relevant data the agent needs to extract or check:
             product prices, item titles in listings, stock/availability status,
             error or success messages, result counts, ratings, scores.
             If an agent wouldn't need to read this value to accomplish a task,
             it is NOT readable — it is chrome.

   chrome — page structure the agent should ignore. This includes:
           navigation bars, headers, footers, breadcrumbs, pagination controls,
           static labels ("Price:", "Description:"), section headings, legal text,
           cookie banners, ads, logos, decorative images, sidebar widgets,
           instructional copy ("Enter your email below"), and any text that is
           part of the permanent page template rather than task-specific data.
           MOST text elements on a typical page are chrome.

   skip — invisible, off-screen, duplicate, or empty elements.

2. NAME — a short kebab-case handle the agent will use to refer to this element
   in future interactions. Examples: "add-to-cart", "item-price", "search-box",
   "check-availability". Only for clickable, typable, and readable elements.
   null for chrome and skip. Names must be unique within the page and describe
   the element's purpose, not its HTML implementation.

Respond ONLY with a JSON array. Each entry: {"index": <number>, "category": "<string>", "name": "<string or null>"}
No explanation, no markdown fences, just the JSON array.`;

function callAnthropic(apiKey, messages, system, maxTokens) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 4096,
      system,
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

function extractText(response) {
  return (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

function parseJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

// Phase 1: Analyze the page — returns a short description used as cached
// context when classifying individual elements.
async function handleAutoAnalyze(data, apiKey) {
  const { screenshotB64, pageUrl } = data;
  if (!screenshotB64) throw new Error('No screenshot provided');

  const system = [{ type: 'text', text: 'You are analyzing a web page to prepare for element classification.' }];
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotB64 } },
      { type: 'text', text: `Page URL: ${pageUrl || 'unknown'}\n\nIn 2-3 sentences: what kind of page is this, what are the key functional areas, and what content is dynamic data vs static page structure?` },
    ],
  }];

  const response = await callAnthropic(apiKey, messages, system, 512);
  return { analysis: extractText(response) };
}

// Phase 2: Classify a batch of elements using cached page context.
// Message structure for prompt caching:
//   System: classification instructions (cache breakpoint)
//   User 1: full page screenshot + URL (cache breakpoint)
//   Asst 1: page analysis from phase 1 (cache breakpoint)
//   User 2: element screenshots + descriptors (varies per batch)
async function handleAutoClassify(data, apiKey) {
  const { fullScreenshotB64, analysisText, elements, pageUrl } = data;
  if (!elements || !elements.length) throw new Error('No elements provided');

  // System prompt with cache breakpoint
  const system = [
    { type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } },
  ];

  // Turn 1: full page screenshot (cached across batches)
  const turn1 = {
    role: 'user',
    content: [
      ...(fullScreenshotB64 ? [{
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: fullScreenshotB64 },
      }] : []),
      { type: 'text', text: `Page: ${pageUrl || 'unknown'}`, cache_control: { type: 'ephemeral' } },
    ],
  };

  // Turn 2: analysis pre-fill (cached across batches)
  const turn2 = {
    role: 'assistant',
    content: [
      { type: 'text', text: analysisText || 'Ready to classify elements.', cache_control: { type: 'ephemeral' } },
    ],
  };

  // Turn 3: per-element screenshots + descriptors (varies per batch)
  const turn3Content = [];
  for (const el of elements) {
    if (el.screenshotB64) {
      turn3Content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: el.screenshotB64 },
      });
    }
    const parts = [`[${el.index}] <${el.tag}>`];
    if (el.elementType) parts.push(`type="${el.elementType}"`);
    if (el.label) parts.push(`label="${el.label}"`);
    if (el.visibleText) parts.push(`text="${el.visibleText.slice(0, 80)}"`);
    if (el.ariaRole) parts.push(`role="${el.ariaRole}"`);
    if (el.locators) {
      if (el.locators.testid) parts.push(`data-testid="${el.locators.testid}"`);
      if (el.locators.id) parts.push(`id="${el.locators.id}"`);
      if (el.locators.name) parts.push(`name="${el.locators.name}"`);
    }
    turn3Content.push({ type: 'text', text: parts.join(' ') });
  }
  turn3Content.push({ type: 'text', text: '\nClassify each element. Respond with a JSON array only.' });

  const messages = [turn1, turn2, { role: 'user', content: turn3Content }];
  const response = await callAnthropic(apiKey, messages, system);
  const classifications = parseJsonResponse(extractText(response));
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

  // POST /auto-analyze — LLM page analysis (phase 1 of auto-classify)
  if (req.method === 'POST' && req.url === '/auto-analyze') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      jsonResponse(res, 500, { error: 'ANTHROPIC_API_KEY not set.' });
      return;
    }
    let body = '';
    let errored = false;
    const MAX_BODY = 50 * 1024 * 1024;
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
        handleAutoAnalyze(data, apiKey).then(result => {
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

  // POST /auto-classify — LLM element classification (phase 2, prompt-cached)
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
