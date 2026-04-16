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

const ANALYZE_SYSTEM = `You are preparing a vocabulary for an AI agent that will perform a task on a web page.

The agent talks about elements by short kebab-case handles. Later, an agent will write plans like "fill search-box with 'earbuds', click search, read product-price". Your job is to define the handle list for this page.

A handle represents one specific element the agent would use to accomplish the page's primary task. Good handles are:

- Specific to this page's purpose (product-price, park-search, buy-now)
- Unique (one element per handle)
- Actionable or informational (the agent either clicks it, types in it, or reads a dynamic value from it)

Output format (exactly):

# Page
<2-3 sentences: what this page is and the primary task(s) an agent would do here>

# Handles
<handle>: <one sentence on which element this is and why the agent would use it>
<handle>: ...

Reference examples of handle lists for common archetypes:

- Product detail: product-title, product-price, condition, seller-name, seller-rating, review-count, buy-now, add-to-cart, shipping-info, returns-policy
- Search results: search-box, search-button, sort-dropdown, result-count, filter-price, filter-condition
- Park reservation home: park-search

A good list is focused: 1–15 handles. Omit everything else — site-wide header/footer nav, related-items rails, image thumbnails, breadcrumbs, category browse trees, legal/privacy links, cookie banners, chat widgets. Those exist on every page and are not part of the per-page vocabulary.`;

const CLASSIFY_SYSTEM = `You are matching each element on a web page against the handle list defined in the prior turn.

The handle list is the complete vocabulary — every non-chrome element must match exactly one handle from that list, and every handle should match exactly one element. Any element that doesn't match a handle is chrome.

For each element, output one of:
- A match: category from {clickable, typable, readable} + name equal to a handle from the list
- category: "chrome", name: null — element is not in the handle vocabulary
- category: "skip", name: null — element is invisible, empty, or has no meaningful content

Category typing for matched elements:
- clickable: buttons, links, checkboxes, radios, selects, tabs
- typable: text inputs, textareas, search boxes
- readable: dynamic text values (prices, titles, counts, status messages)

When multiple elements could match the same handle, pick the one that most directly represents that handle's role (usually the primary/main instance — e.g., the <h1> over an <h3>, the main product's price over a related product's price). The others are chrome.

Output: JSON array only, no prose, no markdown fences.
Each entry: {"index": <number>, "category": "<clickable|typable|readable|chrome|skip>", "name": "<handle>" or null}`;

const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

function callAnthropic(apiKey, messages, system, maxTokens) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: CLASSIFY_MODEL,
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

function formatPromptAsMarkdown(tag, system, messages) {
  const lines = [`# ${tag}`, ''];
  const renderBlock = (b) => {
    if (b.type === 'text') {
      const cached = b.cache_control ? ' *(cached)*' : '';
      return `**text**${cached}:\n\n${b.text}\n`;
    }
    if (b.type === 'image') {
      const bytes = b.source?.data ? Math.round(b.source.data.length * 3 / 4) : 0;
      return `**image** (${b.source?.media_type || 'png'}, ~${bytes} bytes base64)\n`;
    }
    return `**${b.type}** (unknown block)\n`;
  };
  lines.push('## System');
  for (const b of system) lines.push(renderBlock(b));
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    lines.push(`## Turn ${i + 1} — ${m.role}`);
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
    for (const b of content) lines.push(renderBlock(b));
  }
  return lines.join('\n');
}

function maybeDumpPrompt(tag, system, messages) {
  const dir = process.env.TODDLER_DUMP_DIR;
  if (!dir) return;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `${ts}-${tag}.md`);
    fs.writeFileSync(file, formatPromptAsMarkdown(tag, system, messages));
    console.error(`[toddler] dumped prompt: ${file}`);
  } catch (e) {
    console.error(`[toddler] dump failed: ${e.message}`);
  }
}

// Phase 1: Analyze the page — returns a short description used as cached
// context when classifying individual elements.
async function handleAutoAnalyze(data, apiKey) {
  const { screenshotB64, pageUrl } = data;
  if (!screenshotB64) throw new Error('No screenshot provided');

  const system = [{ type: 'text', text: ANALYZE_SYSTEM }];
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotB64 } },
      { type: 'text', text: `Page URL: ${pageUrl || 'unknown'}\n\nDefine the handle list for this page.` },
    ],
  }];

  maybeDumpPrompt('analyze', system, messages);
  const response = await callAnthropic(apiKey, messages, system, 1024);
  return { analysis: extractText(response) };
}

// Phase 2: Classify a batch of elements using cached page context.
// Message structure for prompt caching:
//   System: classification instructions (cache breakpoint)
//   User 1: full page screenshot + URL (cache breakpoint)
//   Asst 1: page analysis from phase 1 (cache breakpoint)
//   User 2: element screenshots + descriptors (varies per batch)
function parseHandlesFromAnalysis(text) {
  if (!text) return [];
  const handles = [];
  let inHandles = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (/^#\s*Handles\b/i.test(line)) { inHandles = true; continue; }
    if (inHandles && /^#\s+/.test(line)) break;
    if (!inHandles) continue;
    const m = line.match(/^([a-z0-9][a-z0-9-]*)\s*:\s*(.+)$/i);
    if (m) handles.push({ name: m[1], desc: m[2] });
  }
  return handles;
}

async function handleAutoClassify(data, apiKey) {
  const { fullScreenshotB64, analysisText, elements, pageUrl, claimedNames } = data;
  if (!elements || !elements.length) throw new Error('No elements provided');

  const handles = parseHandlesFromAnalysis(analysisText);
  const claimed = Array.isArray(claimedNames) ? claimedNames : [];
  const available = handles.filter(h => !claimed.includes(h.name));

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
  // Prepend the closed-set handle list so phase 2 is constrained.
  const turn3Content = [];
  const availableList = available.length
    ? available.map(h => `- ${h.name}: ${h.desc}`).join('\n')
    : '(none — all prior handles already claimed; every element in this batch is chrome)';
  const claimedList = claimed.length
    ? `\nAlready assigned in earlier batches (do NOT reuse): ${claimed.join(', ')}`
    : '';
  turn3Content.push({
    type: 'text',
    text: `Available handles for this batch:\n${availableList}${claimedList}\n\nEach handle may match at most one element across the whole page. If an element does not match one of the available handles above, mark it chrome.`,
  });
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
  maybeDumpPrompt(`classify-batch-start-${elements[0]?.index ?? 'x'}`, system, messages);
  const response = await callAnthropic(apiKey, messages, system);
  const raw = extractText(response);
  let classifications;
  try {
    classifications = parseJsonResponse(raw);
  } catch (e) {
    const dumpDir = process.env.TODDLER_DUMP_DIR;
    if (dumpDir) {
      try {
        const f = path.join(dumpDir, `parse-fail-batch-${elements[0]?.index ?? 'x'}-${Date.now()}.txt`);
        fs.writeFileSync(f, raw);
        console.error(`[toddler] JSON parse failed, raw output dumped to ${f}`);
      } catch {}
    }
    throw new Error(`JSON parse failed: ${e.message}`);
  }
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
          console.error('[toddler] auto-analyze error:', err && err.stack || err);
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
          console.error('[toddler] auto-classify error:', err && err.stack || err);
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
