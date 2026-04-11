// API URL: configurable via ?api= query param (for test environments)
var _params = new URLSearchParams(window.location.search);
const API = _params.get('api') || 'http://localhost:3333';
const STORAGE_KEY = 'toddler-loop-state';

// ?clear=1 wipes localStorage before init (for e2e test isolation)
if (_params.get('clear')) localStorage.removeItem(STORAGE_KEY);

const CATEGORY_COLORS = {
  clickable: '#22c55e',
  typable:   '#3b82f6',
  readable:  '#eab308',
  chrome:    '#6b7280',
  custom:    '#a855f7',
  split:     '#f97316',
  skip:      'transparent',
};

// ---- State ----
let state = {
  inventory: null,
  screenshotUrl: null,
  currentIndex: 0,
  classifications: {},
  screenshotDims: { w: 0, h: 0 },
  pageUrl: null,
  mode: 'pass1',          // 'pass1' | 'pass2' | 'review' | 'resolve' | 'diff'
  glossaryNames: {},       // { [inventoryIndex]: { name, intent, source, notes } }
  pass2Order: [],          // filtered+sorted inventory indices for Pass 2 traversal
  pass2Cursor: 0,          // position within pass2Order
  resolveContext: null,    // active resolve session (null when not resolving)
  _pendingSieve: null,     // pending sieve data during resolve/diff mode
  _preResolveMode: null,   // mode to restore after resolve completes
  _preDiffMode: null,      // mode to restore after diff accept
  diffResult: null,        // output of computeDiff()
  diffClass: null,         // output of classifyDiff()
  diffSelectedIdx: null,   // selected item index in flat diff list
  _diffResolvedPairs: null, // resolved pairs from resolve mode (if any)
  exploreMode: false,        // true = clicking overlay dispatches real clicks
  observationLog: [],        // [{obs1, action, obs2}, ...]
  _exploreInProgress: false, // re-entrancy guard
};

// ---- Persistence ----
function saveState() {
  var data = toIntermediate(state);
  // Schedule server save with full data (including screenshot) before mutating
  autoSave(data);
  if (data) {
    // Strip screenshot from localStorage copy to avoid size limits
    // (toIntermediate returns a fresh object — safe to mutate)
    data.source.screenshot = null;
    // Sidecar: UI-only state (not part of the artifact)
    data._ui = {
      mode: state.mode,
      currentIndex: state.currentIndex,
      pass2Cursor: state.pass2Cursor,
      exploreMode: state.exploreMode,
      observationLog: state.observationLog,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } else {
    // No inventory yet — save minimal UI state so toggles survive refresh
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _ui: {
        exploreMode: state.exploreMode,
        observationLog: state.observationLog,
      },
    }));
  }
}

// ---- Auto-save to disk ----
var _autoSaveTimer = null;
var _autoSaveJson = null;

function autoSave(data) {
  if (!data) return;
  // Stringify eagerly — caller may mutate data after this call
  _autoSaveJson = JSON.stringify(data);
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(function () {
    _autoSaveTimer = null;
    var payload = _autoSaveJson;
    _autoSaveJson = null;
    if (!payload) return;
    fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(10000),
    }).then(function (res) {
      if (!res.ok) throw new Error('Save failed: ' + res.status);
    }).catch(function (e) {
      console.warn('[auto-save]', e.message);
    });
  }, 1500);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    var ui = saved._ui || {};
    // Restore UI-only state that works without inventory
    state.exploreMode = ui.exploreMode || false;
    state.observationLog = ui.observationLog || [];
    // Restore full artifact if present
    if (saved['sieve-version']) {
      const errors = fromIntermediate(saved);
      if (errors.length) { console.warn('[loadState] restore errors:', errors); return; }
      // fromIntermediate derives mode from data — restore actual mode from _ui sidecar
      if (ui.mode === 'review' || ui.mode === 'pass2' || ui.mode === 'pass1') {
        state.mode = ui.mode;
      }
      // fromIntermediate only builds pass2Order when glossary names exist.
      // If the user was in pass2 but hadn't named anything yet, rebuild it now.
      if ((state.mode === 'pass2' || state.mode === 'review') && state.pass2Order.length === 0) {
        buildPass2Order();
      }
      // fromIntermediate resets currentIndex to 0 — restore from _ui sidecar
      var maxIdx = (state.inventory?.elements?.length || 1) - 1;
      state.currentIndex = Math.min(ui.currentIndex || 0, maxIdx);
      state.pass2Cursor = Math.min(ui.pass2Cursor || 0, Math.max(0, state.pass2Order.length - 1));
      if (state.mode === 'pass2' || state.mode === 'review') {
        var pos = state.pass2Order.indexOf(state.currentIndex);
        state.pass2Cursor = pos >= 0 ? pos : state.pass2Cursor;
      }
    }
  } catch (e) { /* ignore corrupt storage */ }
}

// ---- Mode helpers ----
function allPass2Named() {
  if (state.pass2Order.length === 0) return false;
  for (var i = 0; i < state.pass2Order.length; i++) {
    if (!state.glossaryNames[state.pass2Order[i]]) return false;
  }
  return true;
}

function isModeBlocked() {
  return state.mode === 'resolve' || state.mode === 'diff';
}

function showModeBlockedToast() {
  showToast(state.mode === 'resolve'
    ? 'Finish resolving ambiguous matches first.'
    : 'Accept or review the current diff first.');
}

// ---- Render helpers ----
function commitAndRender() {
  saveState();
  renderOverlay();
  renderPanel();
}

function commitRenderScroll() {
  commitAndRender();
  scrollToCurrentElement();
}

// ---- Toast ----
function showToast(msg, duration) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, duration || 4000);
}

// ---- API calls ----
async function fetchSieve() {
  const res = await fetch(API + '/sieve', { method: 'POST', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('Sieve request failed: ' + res.status);
  return res.json();
}

async function fetchScreenshot() {
  const res = await fetch(API + '/screenshot', { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Screenshot request failed: ' + res.status);
  const blob = await res.blob();
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

async function fetchNavigate(url) {
  const res = await fetch(API + '/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('Navigate request failed: ' + res.status);
  return res.json();
}

async function fetchStatus() {
  const res = await fetch(API + '/status', { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('Status request failed: ' + res.status);
  return res.json();
}

async function fetchClick(selector) {
  const res = await fetch(API + '/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('Click request failed: ' + res.status);
  return res.json();
}

// ---- Core actions ----
var _sieveInProgress = false;

async function doSieve() {
  if (_sieveInProgress) return;
  if (isModeBlocked()) { showModeBlockedToast(); return; }
  _sieveInProgress = true;
  const statusEl = document.getElementById('status-indicator');
  statusEl.textContent = 'Sieving...';
  try {
    const [inventory, screenshot] = await Promise.all([
      fetchSieve(),
      fetchScreenshot(),
    ]);

    // If we have a previous inventory, match elements instead of resetting.
    // Enter diff path even if new sieve has 0 elements (all would show as removed).
    if (state.inventory && state.inventory.elements?.length) {
      var oldEls = state.inventory.elements;
      var newEls = inventory.elements || [];
      var matchResult = matchElements(oldEls, newEls);

      var pendingSieve = {
        inventory: inventory,
        screenshotUrl: screenshot,
        matchResult: matchResult,
        oldInventory: state.inventory,
        oldClassifications: Object.assign({}, state.classifications),
        oldGlossaryNames: Object.assign({}, state.glossaryNames),
      };

      if (matchResult.ambiguous.length > 0) {
        statusEl.textContent = matchResult.ambiguous.length + ' ambiguous — resolve';
        enterResolveMode(matchResult, pendingSieve);
      } else {
        statusEl.textContent = 'Diff ready';
        enterDiffMode(matchResult, pendingSieve, null);
      }
      return;
    } else {
      // First sieve — fresh state
      state.inventory = inventory;
      state.screenshotUrl = screenshot;
      state.pageUrl = inventory.url?.raw || inventory.url || null;
      state.classifications = {};
      state.currentIndex = 0;
      state.mode = 'pass1';
      state.glossaryNames = {};
      state.pass2Order = [];
      state.pass2Cursor = 0;
    }

    await renderScreenshot();
    renderOverlay();
    renderPanel();
    renderMetadata();
    saveState();

    statusEl.textContent = (inventory.elements?.length || 0) + ' elements';
  } catch (e) {
    statusEl.textContent = 'Error';
    showToast('Failed to sieve: ' + e.message, 6000);
  } finally {
    _sieveInProgress = false;
  }
}

async function doNavigate() {
  if (_sieveInProgress) return;
  if (isModeBlocked()) { showModeBlockedToast(); return; }
  let url = document.getElementById('url-input').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  document.getElementById('url-input').value = url;
  const statusEl = document.getElementById('status-indicator');
  statusEl.textContent = 'Navigating...';
  try {
    await fetchNavigate(url);
  } catch (e) {
    statusEl.textContent = 'Error';
    showToast('Failed to navigate: ' + e.message, 6000);
    return;
  }
  try {
    await doSieve();
  } catch (e) {
    statusEl.textContent = 'Error';
    showToast('Failed to sieve: ' + e.message, 6000);
  }
}

// ---- Rendering ----
function renderScreenshot() {
  return new Promise((resolve) => {
    const container = document.getElementById('screenshot-container');
    const img = document.getElementById('screenshot-img');
    const emptyState = document.getElementById('empty-state');

    if (!state.screenshotUrl) { resolve(); return; }

    img.onload = function () {
      // Use viewport dims from sieve (CSS pixels) if available,
      // otherwise fall back to natural image dims.
      // Screenshot is captured at device pixel ratio (e.g. 2x on Retina)
      // but sieve rects are in CSS pixels — must match coordinate spaces.
      // During diff mode, state.inventory is the OLD inventory — use pending inventory's viewport.
      var vp = (state._pendingSieve && state._pendingSieve.inventory.viewport)
        || (state.inventory && state.inventory.viewport);
      const w = vp?.w || img.naturalWidth;
      const h = vp?.h || img.naturalHeight;
      state.screenshotDims = { w: w, h: h };
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      container.style.display = 'inline-block';
      emptyState.style.display = 'none';
      resolve();
    };
    img.onerror = function () { resolve(); };
    img.src = state.screenshotUrl;
  });
}

function resolveOverlayRects(els, idxs, ctx, side) {
  // side: 'old' or 'new'
  var isOld = side === 'old';
  var pairKey = isOld ? 'oldIdx' : 'newIdx';
  var selectedIdx = isOld ? ctx.selectedOld : ctx.selectedNew;
  var markedList = isOld ? ctx.removedOld : ctx.addedNew;
  var selColor = isOld ? '#f87171' : '#4ade80';
  var baseColor = isOld ? '#ef4444' : '#22c55e';
  var prefix = isOld ? 'OLD' : 'NEW';

  var html = '';
  for (var i = 0; i < idxs.length; i++) {
    var idx = idxs[i];
    var rect = els[idx]?.rect;
    if (!rect) continue;

    var isPaired = ctx.pairs.some(function (p) { return p[pairKey] === idx; });
    var isMarked = markedList.indexOf(idx) >= 0;
    var isSelected = selectedIdx === idx;
    var dimmed = isPaired || isMarked;

    var stroke = isSelected ? selColor : dimmed ? (isPaired ? '#166534' : '#525252') : baseColor;
    var sw = isSelected ? 3 : 2;
    var w = rect.w;
    var h = rect.h;

    html += '<rect x="' + rect.x + '" y="' + rect.y + '" width="' + w + '" height="' + h + '"'
      + ' fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"'
      + (dimmed ? ' stroke-dasharray="4,3"' : '')
      + ' opacity="' + (dimmed ? 0.4 : 1) + '" pointer-events="none"/>';

    // Label: old above rect, new below rect
    var textY = isOld ? (rect.y > 16 ? rect.y - 4 : rect.y + 14) : (rect.y + h + 12);
    html += '<text x="' + rect.x + '" y="' + textY + '"'
      + ' fill="' + stroke + '" font-size="10" font-family="sans-serif" opacity="' + (dimmed ? 0.4 : 1) + '">'
      + prefix + '#' + idx + ' ' + escapeHtml((els[idx].label || els[idx].tag || '?').slice(0, 20))
      + '</text>';
  }
  return html;
}

function renderResolveOverlay(svg) {
  var ctx = state.resolveContext;
  var pending = state._pendingSieve;
  var group = ctx.allGroups[ctx.currentGroupIdx];
  if (!group) return;

  var dims = state.screenshotDims;
  svg.setAttribute('width', dims.w);
  svg.setAttribute('height', dims.h);
  svg.setAttribute('viewBox', '0 0 ' + dims.w + ' ' + dims.h);

  svg.innerHTML =
    resolveOverlayRects(pending.oldInventory.elements, group.oldIdxs, ctx, 'old')
    + resolveOverlayRects(pending.inventory.elements, group.newIdxs, ctx, 'new');
}

function renderDiffOverlay(svg) {
  var diff = state.diffResult;
  var pending = state._pendingSieve;
  if (!diff || !pending) return;

  var newEls = pending.inventory.elements || [];
  var dims = state.screenshotDims;
  svg.setAttribute('width', dims.w);
  svg.setAttribute('height', dims.h);
  svg.setAttribute('viewBox', '0 0 ' + dims.w + ' ' + dims.h);

  var html = '';
  var selectedType = null;
  var selectedItemIdx = null;
  if (state.diffSelectedIdx !== null) {
    // Decode flat index: added, then removed, then changed
    var si = state.diffSelectedIdx;
    if (si < diff.added.length) { selectedType = 'added'; selectedItemIdx = si; }
    else if (si < diff.added.length + diff.removed.length) { selectedType = 'removed'; selectedItemIdx = si - diff.added.length; }
    else if (si < diff.added.length + diff.removed.length + diff.changed.length) { selectedType = 'changed'; selectedItemIdx = si - diff.added.length - diff.removed.length; }
  }

  // Unchanged elements — dimmed
  for (var u = 0; u < diff.unchanged.length; u++) {
    var ue = diff.unchanged[u];
    var ub = newEls[ue.newIdx]?.rect;
    if (!ub) continue;
    html += '<rect x="' + ub.x + '" y="' + ub.y + '" width="' + ub.w + '" height="' + ub.h + '"'
      + ' fill="none" stroke="#444" stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>';
  }

  // Added elements — green dashed
  for (var a = 0; a < diff.added.length; a++) {
    var ae = diff.added[a];
    var ab = ae.el?.rect;
    if (!ab) continue;
    var isSel = (selectedType === 'added' && selectedItemIdx === a);
    html += '<rect x="' + ab.x + '" y="' + ab.y + '" width="' + ab.w + '" height="' + ab.h + '"'
      + ' fill="rgba(34,197,94,0.08)" stroke="' + (isSel ? '#22d3ee' : '#22c55e') + '"'
      + ' stroke-width="' + (isSel ? 3 : 2) + '" stroke-dasharray="6,3"/>';
    var atY = ab.y - 4;
    html += '<text x="' + ab.x + '" y="' + (atY > 10 ? atY : ab.y + 12) + '"'
      + ' fill="#22c55e" font-size="10" font-family="sans-serif" font-weight="700">NEW</text>';
  }

  // Removed elements — panel only, no overlay (old bounding boxes don't map to new screenshot)

  // Changed elements — yellow solid
  for (var c = 0; c < diff.changed.length; c++) {
    var ce = diff.changed[c];
    var cb = ce.newEl?.rect;
    if (!cb) continue;
    var isSel3 = (selectedType === 'changed' && selectedItemIdx === c);
    html += '<rect x="' + cb.x + '" y="' + cb.y + '" width="' + cb.w + '" height="' + cb.h + '"'
      + ' fill="rgba(234,179,8,0.08)" stroke="' + (isSel3 ? '#22d3ee' : '#eab308') + '"'
      + ' stroke-width="' + (isSel3 ? 3 : 2) + '"/>';
    var ctY = cb.y - 4;
    html += '<text x="' + cb.x + '" y="' + (ctY > 10 ? ctY : cb.y + 12) + '"'
      + ' fill="#eab308" font-size="10" font-family="sans-serif" font-weight="600">'
      + escapeHtml(ce.changes[0].slice(0, 25)) + '</text>';
  }

  svg.innerHTML = html;
}

function renderOverlay() {
  const svg = document.getElementById('overlay-svg');

  // Resolve mode: show old+new element highlights
  if (state.mode === 'resolve' && state.resolveContext && state._pendingSieve) {
    renderResolveOverlay(svg);
    return;
  }

  // Diff mode: show diff overlay
  if (state.mode === 'diff' && state.diffResult) {
    renderDiffOverlay(svg);
    return;
  }

  const elements = state.inventory?.elements;
  if (!elements) return;

  const dims = state.screenshotDims;
  svg.setAttribute('width', dims.w);
  svg.setAttribute('height', dims.h);
  svg.setAttribute('viewBox', '0 0 ' + dims.w + ' ' + dims.h);
  svg.style.cursor = state.exploreMode ? 'pointer' : '';

  const inPass2 = state.mode === 'pass2' || state.mode === 'review';
  const pass2Set = inPass2 ? new Set(state.pass2Order) : null;

  let html = '';
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.rect;
    if (!rect) continue;

    const isCurrent = i === state.currentIndex;
    const classification = state.classifications[i];
    const glossary = state.glossaryNames[i];

    let stroke, strokeWidth, strokeDash, fill;

    if (state.exploreMode) {
      // Explore mode: orange for clickable, dimmed for non-clickable
      var hasSelector = !!buildClickSelector(el);
      if (isCurrent && hasSelector) {
        stroke = '#f97316';
        strokeWidth = 3;
        strokeDash = '';
        fill = 'rgba(249,115,22,0.15)';
      } else if (hasSelector) {
        stroke = '#f9731666';
        strokeWidth = 1.5;
        strokeDash = '';
        fill = 'rgba(249,115,22,0.05)';
      } else {
        stroke = '#444';
        strokeWidth = 1;
        strokeDash = '3,3';
        fill = 'none';
      }
    } else if (inPass2) {
      // Pass 2 / Review overlay
      if (isCurrent) {
        stroke = '#22d3ee';
        strokeWidth = 3;
        strokeDash = '';
        fill = 'rgba(34,211,238,0.1)';
      } else if (glossary) {
        stroke = '#22c55e'; // green — named
        strokeWidth = 2;
        strokeDash = '';
        fill = 'none';
      } else if (pass2Set.has(i)) {
        stroke = '#eab308'; // yellow — unnamed, in pass2
        strokeWidth = 1;
        strokeDash = '4,3';
        fill = 'none';
      } else {
        stroke = '#333'; // faded — chrome/skip/excluded
        strokeWidth = 1;
        strokeDash = '4,3';
        fill = 'none';
      }
    } else {
      // Pass 1 overlay
      if (isCurrent) {
        stroke = '#22d3ee';
        strokeWidth = 3;
        strokeDash = '';
        fill = 'rgba(34,211,238,0.1)';
      } else if (classification) {
        stroke = CATEGORY_COLORS[classification] || '#666';
        strokeWidth = classification === 'chrome' ? 1 : 2;
        strokeDash = '';
        fill = 'none';
        if (classification === 'skip') continue; // hide skipped
      } else {
        stroke = '#666';
        strokeWidth = 1;
        strokeDash = '4,3';
        fill = 'none';
      }
    }

    html += '<rect'
      + ' x="' + rect.x + '"'
      + ' y="' + rect.y + '"'
      + ' width="' + rect.w + '"'
      + ' height="' + rect.h + '"'
      + ' fill="' + fill + '"'
      + ' stroke="' + stroke + '"'
      + ' stroke-width="' + strokeWidth + '"'
      + (strokeDash ? ' stroke-dasharray="' + strokeDash + '"' : '')
      + ' data-index="' + i + '"'
      + ' onclick="jumpTo(' + i + ')"'
      + '/>';

    // Label: current element or named element in pass2
    if (isCurrent) {
      html += svgLabel(rect, el.label || el.tag || '?', '#22d3ee', 12, 600);
    } else if (inPass2 && glossary) {
      var gLabel = ((glossary.intent ? glossary.intent + '.' : '') + glossary.name).slice(0, 25);
      html += svgLabel(rect, gLabel, '#4ade80', 11, 500);
    }
  }

  svg.innerHTML = html;
}

function svgLabel(rect, text, fill, size, weight) {
  var y = rect.y - 4;
  return '<text x="' + rect.x + '" y="' + (y > 12 ? y : rect.y + 14) + '"'
    + ' fill="' + fill + '" font-size="' + size + '" font-family="sans-serif"'
    + ' font-weight="' + weight + '">' + escapeHtml(text) + '</text>';
}

function locatorStr(el) {
  if (!el.locators) return '';
  return Object.entries(el.locators)
    .filter(function (kv) { return kv[1]; })
    .map(function (kv) { return kv[0] + '=' + kv[1]; })
    .join(', ');
}

function fieldHtml(label, value, style) {
  return '<div><span class="field-label">' + label + '</span> '
    + '<span class="field-value"'
    + (style ? ' style="' + style + '"' : '') + '>'
    + escapeHtml(value) + '</span></div>';
}

function updateModeIndicator() {
  var mi = document.getElementById('mode-indicator');
  if (!mi) return;
  var labels = { pass1: 'Pass 1: Classify', pass2: 'Pass 2: Name', review: 'Review', resolve: 'Resolve Matches', diff: 'Sieve Diff' };
  mi.textContent = labels[state.mode] || '';
  mi.className = state.mode;
}

var _lastPass2Rendered = -1;

function renderPass2Panel() {
  var elements = state.inventory?.elements;
  if (!elements) return;

  var el = elements[state.currentIndex];
  if (!el) return;
  var detail = document.getElementById('element-detail');
  var controls = document.getElementById('panel-controls');
  var summary = document.getElementById('summary');
  summary.style.display = 'none';

  // Element info (left side) — always update
  if (el) {
    var locs = locatorStr(el);
    var glossary = state.glossaryNames[state.currentIndex];
    var cat = state.classifications[state.currentIndex];

    detail.innerHTML =
      fieldHtml('tag', el.tag || '—')
      + fieldHtml('label', '"' + (el.label || '—') + '"', 'color:#fbbf24')
      + fieldHtml('region', el.region || '—')
      + (locs ? fieldHtml('locators', locs) : '')
      + fieldHtml('classification', cat || '—', 'color:' + (CATEGORY_COLORS[cat] || '#fff'))
      + (glossary
        ? fieldHtml('glossary name',
            (glossary.intent ? glossary.intent + '.' : '') + glossary.name,
            'color:#4ade80')
        : '');
  }

  // Controls (right side) — only rebuild when element changes to avoid clobbering input
  if (_lastPass2Rendered !== state.currentIndex) {
    _lastPass2Rendered = state.currentIndex;

    var existing = state.glossaryNames[state.currentIndex];
    var nameVal = existing ? existing.name : proposeName(el);
    var intentVal = existing ? existing.intent : deriveIntentName(el?.region);
    var notesVal = existing ? existing.notes : '';

    var namedCount = Object.keys(state.glossaryNames).length;
    var totalPass2 = state.pass2Order.length;

    controls.innerHTML =
      '<div class="pass2-controls">'
      + '<label>Intent</label>'
      + '<input id="intent-input" data-testid="intent-input" value="' + escapeHtml(intentVal) + '" placeholder="e.g. Login">'
      + '<label>Name</label>'
      + '<input id="name-input" data-testid="name-input" value="' + escapeHtml(nameVal) + '" placeholder="e.g. email">'
      + '<label>Notes</label>'
      + '<textarea id="notes-input" placeholder="optional">' + escapeHtml(notesVal) + '</textarea>'
      + '<div class="pass2-btn-row">'
      + '<button type="button" class="btn btn-primary" data-testid="btn-accept-name" onclick="acceptName()">Accept (Enter)</button>'
      + '<button type="button" class="btn" data-testid="btn-skip-name" onclick="skipName()">Skip (Tab)</button>'
      + '</div>'
      + '<div class="pass2-btn-row">'
      + '<button type="button" class="nav-btn" data-testid="nav-prev" onclick="navigate(-1)">&larr;</button>'
      + '<button type="button" class="nav-btn" data-testid="nav-next" onclick="navigate(1)">&rarr;</button>'
      + '<span data-testid="pass2-progress" style="font-size:12px;color:#888;">'
      + namedCount + ' of ' + totalPass2 + ' named</span>'
      + '</div>'
      + '</div>';

    // Auto-focus name input
    var nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.focus();
  } else {
    // Just update progress count without rebuilding inputs
    var prog = controls.querySelector('[data-testid="pass2-progress"]');
    if (prog) {
      prog.textContent = Object.keys(state.glossaryNames).length + ' of ' + state.pass2Order.length + ' named';
    }
  }
}

function renderPanel() {
  updateModeIndicator();
  // Toggle Export Glossary button visibility
  var glossaryBtn = document.getElementById('btn-export-glossary');
  if (glossaryBtn) glossaryBtn.style.display = Object.keys(state.glossaryNames).length > 0 ? '' : 'none';

  // Toggle panel visibility between resolve/diff and normal modes
  var resolveDiv = document.getElementById('resolve-panel');
  var diffDiv = document.getElementById('diff-panel');
  var panelInfo = document.getElementById('panel-info');
  var panelControls = document.getElementById('panel-controls');

  if (state.mode === 'resolve') {
    renderResolvePanel();
    return;
  }

  if (state.mode === 'diff') {
    resolveDiv.style.display = 'none';
    diffDiv.style.display = 'flex';
    panelInfo.style.display = 'none';
    panelControls.style.display = 'none';
    renderDiffPanel();
    return;
  }

  // Restore normal panels (in case we're leaving resolve/diff mode)
  resolveDiv.style.display = 'none';
  diffDiv.style.display = 'none';
  panelInfo.style.display = '';
  panelControls.style.display = '';

  if (state.mode === 'pass2' || state.mode === 'review') {
    renderPass2Panel();
    return;
  }
  const elements = state.inventory?.elements;
  if (!elements || elements.length === 0) return;

  const el = elements[state.currentIndex];
  const detail = document.getElementById('element-detail');
  const summary = document.getElementById('summary');
  const classification = state.classifications[state.currentIndex];

  // Count classified
  const total = elements.length;
  const classifiedCount = Object.keys(state.classifications).length;

  // Element info
  if (el) {
    var locs = locatorStr(el);
    var elType = el['element-type'];

    detail.innerHTML =
      fieldHtml('tag', el.tag || '—')
      + (elType ? fieldHtml('type', elType, 'color:#888') : '')
      + fieldHtml('label', '"' + (el.label || '—') + '"', 'color:#fbbf24')
      + fieldHtml('region', el.region || '—')
      + (locs ? fieldHtml('locators', locs) : '')
      + fieldHtml('sieve category', String(el.category || '—').replace(/^:/, ''))
      + (classification
        ? fieldHtml('your classification', classification, 'color:' + (CATEGORY_COLORS[classification] || '#fff'))
        : '');
  }

  // Progress
  document.getElementById('progress').textContent =
    '#' + (state.currentIndex + 1) + ' / ' + total;
  document.getElementById('classified-count').textContent =
    classifiedCount + ' classified';

  // If all classified, show summary
  if (classifiedCount >= total) {
    showSummary();
  } else {
    summary.style.display = 'none';
  }
}

function showSummary() {
  const elements = state.inventory?.elements;
  if (!elements) return;

  const counts = {};
  for (const cat of Object.values(state.classifications)) {
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const summary = document.getElementById('summary');
  let html = '<div style="margin-bottom:6px;font-weight:600;color:#22d3ee;">'
    + 'Classification complete: ' + elements.length + ' elements</div>';

  for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
    if (cat === 'skip' && !counts[cat]) continue;
    if (counts[cat]) {
      html += '<div class="summary-row">'
        + '<span class="summary-dot" style="background:' + color + '"></span>'
        + '<span>' + counts[cat] + ' ' + cat + '</span>'
        + '</div>';
    }
  }

  if (state.mode === 'pass1') {
    // Only show "Start Pass 2" if there are non-chrome/non-skip elements to name
    var hasNamable = elements.some(function (_, i) {
      var cat = state.classifications[i];
      return cat && cat !== 'chrome' && cat !== 'skip';
    });
    if (hasNamable) {
      html += '<button type="button" class="btn btn-primary" data-testid="btn-start-pass2" onclick="startPass2()" '
        + 'style="margin-top:8px;padding:6px 16px;">Start Pass 2 &rarr;</button>';
    }
  }

  summary.innerHTML = html;
  summary.style.display = 'block';
}

function startPass2() {
  state.mode = 'pass2';
  buildPass2Order();
  if (state.pass2Order.length > 0) {
    state.pass2Cursor = 0;
    state.currentIndex = state.pass2Order[0];
  }
  _lastPass2Rendered = -1;
  commitRenderScroll();
}

function acceptName() {
  if (state.mode !== 'pass2' && state.mode !== 'review') return;
  var nameInput = document.getElementById('name-input');
  var intentInput = document.getElementById('intent-input');
  var notesInput = document.getElementById('notes-input');
  if (!nameInput) return;

  var name = nameInput.value.trim();
  if (!name) { showToast('Name cannot be empty'); return; }

  state.glossaryNames[state.currentIndex] = {
    name: name,
    intent: (intentInput?.value || '').trim(),
    source: 'human',
    notes: (notesInput?.value || '').trim(),
  };
  saveState();

  // Check if all pass2 elements are named
  if (allPass2Named()) {
    state.mode = 'review';
    _lastPass2Rendered = -1;
    commitAndRender();
    return;
  }

  // Advance to next unnamed element
  var len = state.pass2Order.length;
  for (var j = 1; j <= len; j++) {
    var cursor = (state.pass2Cursor + j) % len;
    if (!state.glossaryNames[state.pass2Order[cursor]]) {
      state.pass2Cursor = cursor;
      state.currentIndex = state.pass2Order[cursor];
      break;
    }
  }
  _lastPass2Rendered = -1;
  commitRenderScroll();
}

function skipName() {
  if (state.mode !== 'pass2' && state.mode !== 'review') return;
  var len = state.pass2Order.length;
  if (len === 0) return;
  state.pass2Cursor = (state.pass2Cursor + 1) % len;
  state.currentIndex = state.pass2Order[state.pass2Cursor];
  _lastPass2Rendered = -1;
  commitRenderScroll();
}

// ---- Classification ----
function classify(category) {
  if (!state.inventory?.elements?.length) return;
  if (isModeBlocked()) return;
  state.classifications[state.currentIndex] = category;

  // Advance to next unclassified, or next in line
  const total = state.inventory.elements.length;
  let next = state.currentIndex + 1;

  // Try to find next unclassified
  for (let i = 0; i < total; i++) {
    const idx = (state.currentIndex + 1 + i) % total;
    if (!(idx in state.classifications)) {
      next = idx;
      break;
    }
  }

  // If all classified, stay at current
  if (Object.keys(state.classifications).length >= total) {
    next = state.currentIndex;
  }

  state.currentIndex = Math.min(next, total - 1);
  commitRenderScroll();
}

// ---- Pass 2 Helpers ----
function buildPass2Order() {
  var elements = state.inventory?.elements;
  if (!elements) { state.pass2Order = []; return; }

  // Collect classified, non-chrome, non-skip indices
  var included = [];
  for (var i = 0; i < elements.length; i++) {
    var cat = state.classifications[i];
    if (!cat || cat === 'chrome' || cat === 'skip') continue;
    included.push(i);
  }

  // Group by region
  var groups = {};
  var order = [];
  for (var j = 0; j < included.length; j++) {
    var idx = included[j];
    var region = elements[idx].region || '__none__';
    if (!groups[region]) { groups[region] = []; order.push(region); }
    groups[region].push(idx);
  }

  // Within each region: interactables (clickable, typable) first, then others
  var interactable = { clickable: true, typable: true };
  var result = [];
  for (var k = 0; k < order.length; k++) {
    var g = groups[order[k]];
    var ia = [], rest = [];
    for (var m = 0; m < g.length; m++) {
      if (interactable[state.classifications[g[m]]]) ia.push(g[m]);
      else rest.push(g[m]);
    }
    result = result.concat(ia, rest);
  }

  state.pass2Order = result;
  state.pass2Cursor = 0;
}

function proposeName(el) {
  var raw = (el.locators?.testid)
    || (el.locators?.id)
    || (el.locators?.name)
    || (el.label)
    || (el.tag);
  if (!raw) return '';
  // kebab-case: lowercase, replace non-alphanumeric runs with hyphens, trim hyphens
  var name = raw.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name.slice(0, 30);
}

function deriveIntentName(region) {
  if (!region) return '';
  // Last segment of region path, title-cased
  var parts = region.split('>');
  var last = parts[parts.length - 1].trim();
  // Title-case: "login-form" -> "Login Form"
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ---- Element Identity (qo2) ----
// isDynamicId, bestLocator, toGlossaryIntents, toEdn → glossary.js
// elementKey, matchElements, computeDiff, classifyDiff, propagateNames → diff.js

function buildClickSelector(el) {
  var loc = el.locators;
  if (!loc) return null;
  if (loc.testid) return '[data-testid="' + CSS.escape(loc.testid) + '"]';
  if (loc.id && !isDynamicId(loc.id)) return '#' + CSS.escape(loc.id);
  if (loc.name) return '[name="' + CSS.escape(loc.name) + '"]';
  return null;
}


// ---- Resolve Mode (qo2) ----

function enterResolveMode(matchResult, pendingSieve) {
  state._preResolveMode = state.mode;
  state.mode = 'resolve';
  state._pendingSieve = pendingSieve;

  var groups = matchResult.ambiguous;
  state.resolveContext = {
    allGroups: groups,
    currentGroupIdx: 0,
    selectedOld: null,
    selectedNew: null,
    pairs: [],
    removedOld: [],
    addedNew: [],
    matchResult: matchResult,
  };

  renderOverlay();
  renderPanel();
}

function resolveSelectOld(idx) {
  if (!state.resolveContext) return;
  // Don't select if already paired or marked
  if (state.resolveContext.pairs.some(function (p) { return p.oldIdx === idx; })) return;
  if (state.resolveContext.removedOld.indexOf(idx) >= 0) return;
  state.resolveContext.selectedOld = idx;
  renderResolvePanel();
  renderOverlay();
}

function resolveSelectNew(idx) {
  if (!state.resolveContext) return;
  if (state.resolveContext.pairs.some(function (p) { return p.newIdx === idx; })) return;
  if (state.resolveContext.addedNew.indexOf(idx) >= 0) return;

  // If an old element is selected, pair them
  if (state.resolveContext.selectedOld !== null) {
    state.resolveContext.pairs.push({
      oldIdx: state.resolveContext.selectedOld,
      newIdx: idx,
    });
    state.resolveContext.selectedOld = null;
    state.resolveContext.selectedNew = null;

    // Check if current group is done, auto-advance
    if (isCurrentGroupResolved()) {
      if (state.resolveContext.currentGroupIdx < state.resolveContext.allGroups.length - 1) {
        state.resolveContext.currentGroupIdx++;
      }
    }
    renderResolvePanel();
    renderOverlay();
  } else {
    state.resolveContext.selectedNew = idx;
    renderResolvePanel();
    renderOverlay();
  }
}

function resolveMark(idx, side) {
  // side: 'old' marks as removed, 'new' marks as added
  if (!state.resolveContext) return;
  var ctx = state.resolveContext;
  if (side === 'old') {
    ctx.removedOld.push(idx);
    if (ctx.selectedOld === idx) ctx.selectedOld = null;
  } else {
    ctx.addedNew.push(idx);
    if (ctx.selectedNew === idx) ctx.selectedNew = null;
  }
  if (isCurrentGroupResolved() && ctx.currentGroupIdx < ctx.allGroups.length - 1) {
    ctx.currentGroupIdx++;
  }
  renderResolvePanel();
  renderOverlay();
}

function resolveMarkOldRemoved(idx) { resolveMark(idx, 'old'); }
function resolveMarkNewAdded(idx) { resolveMark(idx, 'new'); }

function resolveUndo(type, a, b) {
  // type: 'pair' | 'removed' | 'added'
  if (!state.resolveContext) return;
  var ctx = state.resolveContext;
  if (type === 'pair') {
    ctx.pairs = ctx.pairs.filter(function (p) { return !(p.oldIdx === a && p.newIdx === b); });
  } else if (type === 'removed') {
    ctx.removedOld = ctx.removedOld.filter(function (i) { return i !== a; });
  } else {
    ctx.addedNew = ctx.addedNew.filter(function (i) { return i !== a; });
  }
  renderResolvePanel();
  renderOverlay();
}

function resolveUndoPair(oldIdx, newIdx) { resolveUndo('pair', oldIdx, newIdx); }
function resolveUndoRemoved(idx) { resolveUndo('removed', idx); }
function resolveUndoAdded(idx) { resolveUndo('added', idx); }

function isGroupResolved(group, ctx) {
  for (var i = 0; i < group.oldIdxs.length; i++) {
    var oi = group.oldIdxs[i];
    if (!ctx.pairs.some(function (p) { return p.oldIdx === oi; }) && ctx.removedOld.indexOf(oi) < 0) return false;
  }
  for (var j = 0; j < group.newIdxs.length; j++) {
    var ni = group.newIdxs[j];
    if (!ctx.pairs.some(function (p) { return p.newIdx === ni; }) && ctx.addedNew.indexOf(ni) < 0) return false;
  }
  return true;
}

function isCurrentGroupResolved() {
  var ctx = state.resolveContext;
  if (!ctx) return false;
  var group = ctx.allGroups[ctx.currentGroupIdx];
  return group ? isGroupResolved(group, ctx) : false;
}

function areAllGroupsResolved() {
  var ctx = state.resolveContext;
  if (!ctx) return false;
  for (var g = 0; g < ctx.allGroups.length; g++) {
    if (!isGroupResolved(ctx.allGroups[g], ctx)) return false;
  }
  return true;
}

function finishResolve() {
  var ctx = state.resolveContext;
  var pending = state._pendingSieve;
  if (!ctx || !pending) return;
  if (!areAllGroupsResolved()) return;

  // Merge resolve decisions into matchResult so computeDiff sees them
  var merged = {
    matched: ctx.matchResult.matched.concat(ctx.pairs),
    added: ctx.matchResult.added.concat(
      ctx.addedNew.map(function (idx) {
        var key = ctx.allGroups.reduce(function (found, g) {
          return found || (g.newIdxs.indexOf(idx) >= 0 ? g.key : null);
        }, null) || '';
        return { newIdx: idx, key: key };
      })
    ),
    removed: ctx.matchResult.removed.concat(
      ctx.removedOld.map(function (idx) {
        var key = ctx.allGroups.reduce(function (found, g) {
          return found || (g.oldIdxs.indexOf(idx) >= 0 ? g.key : null);
        }, null) || '';
        return { oldIdx: idx, key: key };
      })
    ),
    ambiguous: [],
  };

  enterDiffMode(merged, pending, ctx.pairs);
}

// ---- Diff Mode (cuo) ----

function enterDiffMode(matchResult, pendingSieve, resolvedPairs) {
  var oldEls = pendingSieve.oldInventory.elements;
  var newEls = pendingSieve.inventory.elements || [];

  state.diffResult = computeDiff(oldEls, newEls, matchResult);
  state.diffClass = classifyDiff(
    state.diffResult,
    pendingSieve.oldInventory.url?.raw || pendingSieve.oldInventory.url || state.pageUrl,
    pendingSieve.inventory.url?.raw || pendingSieve.inventory.url
  );
  state.diffSelectedIdx = null;
  state._diffResolvedPairs = resolvedPairs || null;

  // Save pre-diff mode (may already be saved from resolve)
  if (state.mode !== 'resolve') {
    state._preDiffMode = state.mode;
  } else {
    state._preDiffMode = state._preResolveMode || 'pass1';
  }

  state._pendingSieve = pendingSieve;
  state.mode = 'diff';

  // Show new screenshot in diff mode, with matching viewport dimensions
  state.screenshotUrl = pendingSieve.screenshotUrl;
  var newVp = pendingSieve.inventory.viewport;
  if (newVp) state.screenshotDims = { w: newVp.w, h: newVp.h };

  // Clean up resolve state
  state.resolveContext = null;
  state._preResolveMode = null;

  renderOverlay();
  renderPanel();
  renderMetadata();
  // Don't saveState here — diff mode is transient. The state object still holds
  // the OLD inventory but has the NEW screenshot, so persisting would create a
  // mismatch. If the user refreshes, they revert to the pre-diff state (already saved).
  renderScreenshot().catch(function () {});
}

function acceptDiff() {
  var pending = state._pendingSieve;
  var diff = state.diffResult;
  if (!pending || !diff) return;

  // Save pre-diff cursor position for restoration
  var preDiffCursor = state.pass2Cursor;

  // Propagate names from old → new
  var propagated = propagateNames(
    pending.matchResult,
    pending.oldClassifications,
    pending.oldGlossaryNames,
    state._diffResolvedPairs
  );

  // Apply new inventory
  state.inventory = pending.inventory;
  state.pageUrl = pending.inventory.url?.raw || pending.inventory.url || null;
  state.classifications = propagated.classifications;
  state.glossaryNames = propagated.glossaryNames;
  state.currentIndex = 0;

  // Restore mode
  state.mode = state._preDiffMode || 'pass1';

  // Clear diff state
  state.diffResult = null;
  state.diffClass = null;
  state.diffSelectedIdx = null;
  state._diffResolvedPairs = null;
  state._pendingSieve = null;
  state._preDiffMode = null;

  // Rebuild pass2 order if returning to pass2 or review
  _lastPass2Rendered = -1; // force panel rebuild — element data replaced by diff
  if (state.mode === 'pass2' || state.mode === 'review') {
    // Check if diff introduced unclassified elements — if so, user needs pass1 first
    var allClassified = state.inventory.elements.every(function (_, i) {
      return !!state.classifications[i];
    });
    if (!allClassified) {
      state.mode = 'pass1';
      state.pass2Order = [];
      state.pass2Cursor = 0;
      // Jump to first unclassified element so user can continue where needed
      state.currentIndex = state.inventory.elements.findIndex(function (_, i) {
        return !state.classifications[i];
      });
    } else {
      buildPass2Order();
      // Try to preserve user's position in pass2 order
      state.pass2Cursor = Math.min(preDiffCursor, Math.max(0, state.pass2Order.length - 1));
      if (state.pass2Order.length > 0) state.currentIndex = state.pass2Order[state.pass2Cursor];
      // Sync mode with naming state: downgrade review→pass2 if unnamed elements
      // appeared, upgrade pass2→review if diff removed the last unnamed element
      if (allPass2Named()) {
        state.mode = 'review';
      } else if (state.mode === 'review') {
        state.mode = 'pass2';
      }
    }
  }

  var summary = diff.added.length + ' added, ' + diff.removed.length + ' removed, '
    + diff.changed.length + ' changed, ' + diff.unchanged.length + ' unchanged';
  showToast('Diff accepted: ' + summary);

  renderOverlay();
  renderPanel();
  renderMetadata();
  saveState();
}

function renderDiffPanel() {
  var diff = state.diffResult;
  var pending = state._pendingSieve;
  if (!diff || !pending) return;

  var panel = document.getElementById('diff-panel');
  var classification = state.diffClass || 'unknown';
  var oldUrl = pending.oldInventory?.url?.raw || pending.oldInventory?.url || state.pageUrl || '';
  var newUrl = pending.inventory?.url?.raw || pending.inventory?.url || '';

  // Classification banner
  var bannerText = classification;
  if (classification === 'navigation' && oldUrl !== newUrl) {
    bannerText += ' \u2014 URL changed from ' + oldUrl + ' to ' + newUrl;
  }

  var html = '<div class="diff-banner" data-testid="diff-classification">' + escapeHtml(bannerText) + '</div>';

  // Counts
  html += '<div class="diff-counts">'
    + '<span class="added" data-testid="diff-added-count">' + diff.added.length + ' added</span>'
    + '<span class="removed" data-testid="diff-removed-count">' + diff.removed.length + ' removed</span>'
    + '<span class="changed" data-testid="diff-changed-count">' + diff.changed.length + ' changed</span>'
    + '<span class="unchanged">' + diff.unchanged.length + ' unchanged</span>'
    + '</div>';

  // Scrollable change list
  html += '<div class="diff-list" data-testid="diff-change-list">';

  var diffSections = [
    { items: diff.added,   cssClass: 'diff-added',   typeLabel: 'new',     typeClass: 'added',   elKey: 'el' },
    { items: diff.removed, cssClass: 'diff-removed', typeLabel: 'removed', typeClass: 'removed', elKey: 'el' },
    { items: diff.changed, cssClass: 'diff-changed', typeLabel: 'changed', typeClass: 'changed', elKey: 'newEl' },
  ];

  var flatIdx = 0;
  for (var s = 0; s < diffSections.length; s++) {
    var sec = diffSections[s];
    for (var i = 0; i < sec.items.length; i++) {
      var item = sec.items[i];
      var el = item[sec.elKey];
      var sel = state.diffSelectedIdx === flatIdx ? ' selected' : '';
      html += '<div class="diff-item ' + sec.cssClass + sel + '" onclick="diffSelectItem(' + flatIdx + ')">'
        + '<span class="di-type ' + sec.typeClass + '">' + sec.typeLabel + '</span>'
        + '<span class="di-tag">' + escapeHtml(el?.tag || '?') + '</span> '
        + '<span class="di-label">' + escapeHtml((el?.label || '').slice(0, 40)) + '</span>'
        + (item.changes ? '<div class="di-changes">' + escapeHtml(item.changes.join(', ')) + '</div>' : '')
        + '</div>';
      flatIdx++;
    }
  }

  html += '</div>';

  // Accept button
  html += '<div class="diff-actions">'
    + '<button type="button" class="btn" data-testid="btn-accept-diff" onclick="acceptDiff()"'
    + ' style="background:#1e3a5f;color:#60a5fa;border:1px solid #60a5fa;">'
    + 'Accept \u2014 apply changes</button>'
    + '</div>';

  panel.innerHTML = html;
}

function diffSelectItem(flatIdx) {
  state.diffSelectedIdx = (state.diffSelectedIdx === flatIdx) ? null : flatIdx;
  renderDiffPanel();
  renderOverlay();
}

function resolveColumnHtml(els, idxs, ctx, pending, side) {
  var isOld = side === 'old';
  var pairKey = isOld ? 'oldIdx' : 'newIdx';
  var otherKey = isOld ? 'newIdx' : 'oldIdx';
  var selectedIdx = isOld ? ctx.selectedOld : ctx.selectedNew;
  var markedList = isOld ? ctx.removedOld : ctx.addedNew;
  var selectFn = isOld ? 'resolveSelectOld' : 'resolveSelectNew';
  var markFn = isOld ? 'resolveMarkOldRemoved' : 'resolveMarkNewAdded';
  var undoMarkFn = isOld ? 'resolveUndoRemoved' : 'resolveUndoAdded';
  var markLabel = isOld ? 'removed' : 'new';
  var markColor = isOld ? '#ef4444' : '#3b82f6';
  var testid = isOld ? 'resolve-old-list' : 'resolve-new-list';
  var heading = isOld ? 'Old elements (carry data from)' : 'New elements (receive data)';

  var html = '<div class="resolve-col" data-testid="' + testid + '"><h4>' + heading + '</h4>';

  for (var i = 0; i < idxs.length; i++) {
    var idx = idxs[i];
    var el = els[idx];
    var isPaired = ctx.pairs.some(function (p) { return p[pairKey] === idx; });
    var isMarked = markedList.indexOf(idx) >= 0;
    var isSelected = selectedIdx === idx;

    var itemClass = 'resolve-item';
    if (isPaired) itemClass += ' paired';
    else if (isMarked) itemClass += ' marked';
    else if (isSelected) itemClass += ' selected';

    var btnStyle = 'font-size:10px;padding:2px 6px;';
    html += '<div class="' + itemClass + '">';
    html += '<span class="ri-tag">' + escapeHtml(el.tag || '?') + '</span>'
      + '<span class="ri-label">' + escapeHtml(el.label || '—') + '</span>';

    if (isPaired) {
      var pair = ctx.pairs.find(function (p) { return p[pairKey] === idx; });
      var otherId = pair[otherKey];
      var arrow = isOld ? 'paired\u2192#' + otherId : '\u2190paired#' + otherId;
      html += '<span style="color:#22c55e;font-size:11px;">' + arrow + '</span>'
        + '<button type="button" class="btn" style="' + btnStyle + '" onclick="resolveUndoPair('
        + (isOld ? idx + ',' + otherId : otherId + ',' + idx) + ')">undo</button>';
    } else if (isMarked) {
      html += '<span style="color:' + markColor + ';font-size:11px;">' + markLabel + '</span>'
        + '<button type="button" class="btn" style="' + btnStyle + '" onclick="' + undoMarkFn + '(' + idx + ')">undo</button>';
    } else {
      // Unresolved item — show metadata, select/mark buttons
      if (isOld) {
        var catColor = CATEGORY_COLORS[pending.oldClassifications[idx]] || '#666';
        if (pending.oldClassifications[idx]) {
          html += '<span class="ri-cat" style="border-color:' + catColor + ';color:' + catColor + ';">'
            + pending.oldClassifications[idx] + '</span>';
        }
        var gName = pending.oldGlossaryNames[idx];
        if (gName) {
          html += '<span class="ri-name">' + escapeHtml((gName.intent ? gName.intent + '.' : '') + gName.name) + '</span>';
        }
      } else {
        var rect = el.rect;
        if (rect) {
          html += '<span style="color:#666;font-size:10px;">' + Math.round(rect.x) + ',' + Math.round(rect.y) + '</span>';
        }
      }
      html += '<button type="button" class="btn" style="' + btnStyle + '" onclick="' + selectFn + '(' + idx + ')">select</button>'
        + '<button type="button" class="btn" style="' + btnStyle + 'color:' + markColor + ';border-color:' + markColor + ';" onclick="' + markFn + '(' + idx + ')">' + markLabel + '</button>';
    }
    html += '</div>';
  }
  return html + '</div>';
}

function renderResolvePanel() {
  var ctx = state.resolveContext;
  if (!ctx) return;

  var group = ctx.allGroups[ctx.currentGroupIdx];
  if (!group) return;

  var pending = state._pendingSieve;
  var oldEls = pending.oldInventory.elements;
  var newEls = pending.inventory.elements;

  var resolveDiv = document.getElementById('resolve-panel');
  var panelInfo = document.getElementById('panel-info');
  var panelControls = document.getElementById('panel-controls');

  // Show resolve panel, hide normal panels
  panelInfo.style.display = 'none';
  panelControls.style.display = 'none';
  resolveDiv.style.display = 'flex';

  var html = '';

  // Banner
  html += '<div class="resolve-banner" data-testid="resolve-banner">'
    + '<span>Resolve ambiguous matches: group ' + (ctx.currentGroupIdx + 1) + ' of ' + ctx.allGroups.length
    + ' &mdash; key: <code style="background:#1a1a2e;padding:2px 6px;border-radius:3px;">' + escapeHtml(group.key) + '</code></span>'
    + '<span data-testid="resolve-progress">' + (areAllGroupsResolved() ? 'All resolved' : 'Resolving...') + '</span>'
    + '</div>';

  // Two columns
  html += '<div class="resolve-columns">'
    + resolveColumnHtml(oldEls, group.oldIdxs, ctx, pending, 'old')
    + resolveColumnHtml(newEls, group.newIdxs, ctx, pending, 'new')
    + '</div>';

  // Action bar
  var allDone = areAllGroupsResolved();
  html += '<div class="resolve-actions">';
  if (ctx.allGroups.length > 1) {
    html += '<button type="button" class="btn" onclick="resolveNavGroup(-1)"'
      + (ctx.currentGroupIdx === 0 ? ' disabled style="opacity:0.4"' : '') + '>&larr; Prev group</button>';
    html += '<button type="button" class="btn" onclick="resolveNavGroup(1)"'
      + (ctx.currentGroupIdx >= ctx.allGroups.length - 1 ? ' disabled style="opacity:0.4"' : '') + '>Next group &rarr;</button>';
  }
  html += '<span style="flex:1;"></span>';
  html += '<button type="button" class="btn btn-primary" data-testid="btn-resolve-done" onclick="finishResolve()"'
    + (allDone ? '' : ' disabled style="opacity:0.4"') + '>Done — apply matches</button>';
  html += '</div>';

  resolveDiv.innerHTML = html;
}

function resolveNavGroup(delta) {
  if (!state.resolveContext) return;
  var next = state.resolveContext.currentGroupIdx + delta;
  if (next >= 0 && next < state.resolveContext.allGroups.length) {
    state.resolveContext.currentGroupIdx = next;
    state.resolveContext.selectedOld = null;
    state.resolveContext.selectedNew = null;
    renderResolvePanel();
    renderOverlay();
  }
}

function navigate(delta) {
  if (!state.inventory?.elements?.length) return;
  if (isModeBlocked()) return;
  if (state.mode === 'pass2' || state.mode === 'review') {
    var len = state.pass2Order.length;
    if (len === 0) return;
    state.pass2Cursor = Math.max(0, Math.min(len - 1, state.pass2Cursor + delta));
    state.currentIndex = state.pass2Order[state.pass2Cursor];
    _lastPass2Rendered = -1;
  } else {
    const total = state.inventory.elements.length;
    state.currentIndex = Math.max(0, Math.min(total - 1, state.currentIndex + delta));
  }
  commitRenderScroll();
}

async function jumpTo(index) {
  if (!state.inventory?.elements?.length) return;
  if (index < 0 || index >= state.inventory.elements.length) return;
  if (state.exploreMode && state.mode !== 'resolve' && state.mode !== 'diff') {
    await doExploreClick(index);
    return;
  }
  state.currentIndex = index;
  if (state.mode === 'pass2' || state.mode === 'review') {
    var pos = state.pass2Order.indexOf(index);
    if (pos >= 0) state.pass2Cursor = pos;
    _lastPass2Rendered = -1;
  }
  commitAndRender();
}

async function doExploreClick(index) {
  if (state._exploreInProgress || _sieveInProgress) return;
  if (isModeBlocked()) { showModeBlockedToast(); return; }
  var el = state.inventory.elements[index];
  if (!el) return;

  var selector = buildClickSelector(el);
  if (!selector) {
    showToast('No reliable selector for this element', 4000);
    return;
  }

  state._exploreInProgress = true;
  var statusEl = document.getElementById('status-indicator');
  statusEl.textContent = 'Clicking...';

  var obs1 = {
    url: state.pageUrl,
    elementCount: state.inventory.elements.length,
    timestamp: Date.now(),
  };

  try {
    await fetchClick(selector);

    var action = {
      type: 'click',
      selector: selector,
      elementLabel: el.label || el.tag || '?',
      elementIndex: index,
    };

    statusEl.textContent = 'Re-sieving...';
    await doSieve();

    // After doSieve(), state.pageUrl may not be updated yet (diff/resolve mode
    // defers the update). Use pending sieve data for the real URL.
    var postUrl = state.pageUrl;
    if (state._pendingSieve) {
      postUrl = state._pendingSieve.inventory?.url?.raw || state._pendingSieve.inventory?.url || postUrl;
    }
    var obs2 = {
      url: postUrl,
      elementCount: state._pendingSieve?.inventory?.elements?.length || state.inventory?.elements?.length || 0,
      timestamp: Date.now(),
    };

    state.observationLog.push({ obs1: obs1, action: action, obs2: obs2 });
    // Cap observation log to prevent unbounded localStorage growth
    if (state.observationLog.length > 100) {
      state.observationLog = state.observationLog.slice(-100);
    }
    saveState();
  } catch (e) {
    statusEl.textContent = 'Click failed';
    if (e.message.includes('404') || e.message.includes('405')) {
      showToast('Server does not support /click — upgrade sieve server', 6000);
    } else {
      showToast('Click failed: ' + e.message, 6000);
    }
  } finally {
    state._exploreInProgress = false;
  }
}

function scrollToCurrentElement() {
  const el = state.inventory?.elements?.[state.currentIndex];
  if (!el?.rect) return;

  const viewport = document.getElementById('viewport');
  const rect = el.rect;

  // Scroll to center the element in the viewport
  const targetY = rect.y - viewport.clientHeight / 3;
  const targetX = rect.x - viewport.clientWidth / 3;
  viewport.scrollTo({
    top: Math.max(0, targetY),
    left: Math.max(0, targetX),
    behavior: 'smooth',
  });
}

// ---- Intermediate Format (delegates to intermediate.js) ----
// toIntermediate is used directly from the module (loaded via <script>).
// fromIntermediate wraps parseIntermediate with state hydration + mode derivation.
function fromIntermediate(data) {
  var result = parseIntermediate(data);
  if (result.errors) return result.errors;

  // Hydrate state from parsed fields
  state.inventory = result.inventory;
  state.classifications = result.classifications;
  state.glossaryNames = result.glossaryNames;
  state.pageUrl = result.pageUrl;
  state.currentIndex = 0;
  state.screenshotUrl = result.screenshotUrl;
  // Set viewport dims from inventory so overlay aligns if screenshot loads later
  var vp = state.inventory.viewport;
  if (vp) state.screenshotDims = { w: vp.w, h: vp.h };

  // Derive mode from data: pass1 → pass2 → review
  // Only advance to pass2 if all elements are classified (pass1 complete)
  var allClassified = state.inventory.elements.every(function (_, i) {
    return !!state.classifications[i];
  });
  if (allClassified && Object.keys(result.glossaryNames).length > 0) {
    state.mode = 'pass2';
    buildPass2Order();
    if (state.pass2Order.length === 0) {
      // All elements are chrome/skip — nothing to name, stay in pass1
      state.mode = 'pass1';
      state.pass2Order = [];
      state.pass2Cursor = 0;
    } else if (allPass2Named()) {
      state.mode = 'review';
    }
    var pos = state.pass2Order.indexOf(state.currentIndex);
    state.pass2Cursor = pos >= 0 ? pos : 0;
  } else {
    state.mode = 'pass1';
    state.pass2Order = [];
    state.pass2Cursor = 0;
  }

  return [];
}

// ---- Export ----
function doExport() {
  if (isModeBlocked()) { showModeBlockedToast(); return; }
  const data = toIntermediate(state);
  if (!data) {
    showToast('Nothing to export — run Sieve first.');
    return;
  }

  downloadBlob(JSON.stringify(data, null, 2), 'toddler-session-' + Date.now() + '.json', 'application/json');
}

async function doExportGlossary() {
  if (isModeBlocked()) { showModeBlockedToast(); return; }
  const data = toIntermediate(state);
  if (!data) {
    showToast('Nothing to export — run Sieve first.');
    return;
  }
  const intents = toGlossaryIntents(data);
  if (intents.length === 0) {
    showToast('No named elements — complete Pass 2 first.');
    return;
  }

  // Try POST to SL glossary endpoint
  try {
    const resp = await fetch(API + '/glossary/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intents),
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      showToast('Exported ' + intents.length + ' intent' + (intents.length > 1 ? 's' : '') + ' to glossary.');
      return;
    }
  } catch (_) { /* fall through to download */ }

  // Fallback: download EDN files
  intents.forEach(function (intent) {
    var edn = toEdn(intent);
    var filename = intent.intent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.edn';
    downloadBlob(edn + '\n', filename, 'application/edn');
  });
  showToast('Glossary endpoint unavailable — downloaded ' + intents.length + ' EDN file' + (intents.length > 1 ? 's' : '') + '.');
}

// ---- Load ----
document.getElementById('btn-load').addEventListener('click', function () {
  document.getElementById('file-input').click();
});

document.getElementById('btn-explore-mode').addEventListener('click', function () {
  state.exploreMode = !state.exploreMode;
  this.classList.toggle('btn-explore-active', state.exploreMode);
  this.textContent = state.exploreMode ? 'Explore ON' : 'Explore';
  renderOverlay();
  saveState();
});

document.getElementById('file-input').addEventListener('change', async function (e) {
  if (isModeBlocked()) { showModeBlockedToast(); e.target.value = ''; return; }
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';  // reset so same file can be re-loaded
  const reader = new FileReader();
  reader.onload = async function () {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      showToast('Invalid JSON: ' + err.message);
      return;
    }
    const errors = fromIntermediate(data);
    if (errors.length) {
      showToast('Load failed: ' + errors.join('; '));
      return;
    }
    _lastPass2Rendered = -1; // force panel rebuild — element data replaced
    const n = state.inventory ? state.inventory.elements.length : 0;
    document.getElementById('status-indicator').textContent =
      n + ' element' + (n !== 1 ? 's' : '') + ' (loaded)';
    try {
      await renderScreenshot();
    } catch (err) {
      showToast('Screenshot failed to load');
    }
    renderOverlay();
    renderPanel();
    renderMetadata();
    saveState();
    showToast('Loaded ' + n + ' elements.', 3000);
  };
  reader.readAsText(file);
});

// ---- Keyboard ----
const KEY_MAP = {
  c: 'clickable',
  t: 'typable',
  r: 'readable',
  x: 'chrome',
  u: 'custom',
  '/': 'split',
  '.': 'skip',
};

function handleResolveKeydown(e) {
  var ctx = state.resolveContext;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (ctx.selectedOld !== null && ctx.selectedNew !== null) {
      resolveSelectNew(ctx.selectedNew);
    } else if (areAllGroupsResolved()) {
      finishResolve();
    }
    return;
  }
  if (e.key === 'd') {
    e.preventDefault();
    if (ctx.selectedOld !== null) resolveMarkOldRemoved(ctx.selectedOld);
    else if (ctx.selectedNew !== null) resolveMarkNewAdded(ctx.selectedNew);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    resolveNavGroup(1);
    return;
  }
  var digitMatch = e.code && e.code.match(/^Digit([1-9])$/);
  if (digitMatch) {
    e.preventDefault();
    var group = ctx.allGroups[ctx.currentGroupIdx];
    var pos = parseInt(digitMatch[1]) - 1;
    if (e.shiftKey) {
      if (group && pos < group.newIdxs.length) resolveSelectNew(group.newIdxs[pos]);
    } else {
      if (group && pos < group.oldIdxs.length) resolveSelectOld(group.oldIdxs[pos]);
    }
  }
}

function handleDiffKeydown(e) {
  var diff = state.diffResult;
  var totalItems = diff.added.length + diff.removed.length + diff.changed.length;

  if (e.key === 'Enter') { e.preventDefault(); acceptDiff(); return; }

  if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (totalItems === 0) return;
    state.diffSelectedIdx = state.diffSelectedIdx === null ? 0 : Math.min(totalItems - 1, state.diffSelectedIdx + 1);
    renderDiffPanel();
    renderOverlay();
    return;
  }
  if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (totalItems === 0) return;
    state.diffSelectedIdx = state.diffSelectedIdx === null ? 0 : Math.max(0, state.diffSelectedIdx - 1);
    renderDiffPanel();
    renderOverlay();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    state.diffSelectedIdx = null;
    renderDiffPanel();
    renderOverlay();
  }
}

function handlePass2Keydown(e) {
  var active = document.activeElement;
  var inInput = active && (active.id === 'name-input' || active.id === 'intent-input' || active.id === 'notes-input');

  if (e.key === 'Escape') {
    e.preventDefault();
    if (state.mode === 'pass2' && allPass2Named()) {
      state.mode = 'review';
    } else if (state.mode === 'pass2') {
      return; // can't enter review until all pass2 elements are named
    } else {
      state.mode = 'pass2';
      buildPass2Order();
      if (state.pass2Order.length > 0) {
        var pos = state.pass2Order.indexOf(state.currentIndex);
        state.pass2Cursor = pos >= 0 ? pos : 0;
        state.currentIndex = state.pass2Order[state.pass2Cursor];
      }
    }
    _lastPass2Rendered = -1;
    commitAndRender();
    return;
  }

  if (state.mode === 'pass2' || state.mode === 'review') {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inInput) active.blur();
      acceptName();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (inInput) active.blur();
      skipName();
      return;
    }
  }

  if (!inInput) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); return; }
  }
}

function handlePass1Keydown(e) {
  if (KEY_MAP[e.key]) {
    e.preventDefault();
    classify(KEY_MAP[e.key]);
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigate(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigate(1);
  }
}

document.addEventListener('keydown', function (e) {
  // Don't capture when typing in the URL input
  if (document.activeElement === document.getElementById('url-input')) {
    if (e.key === 'Enter') { e.preventDefault(); doNavigate(); }
    return;
  }

  if (state.mode === 'resolve' && state.resolveContext) return handleResolveKeydown(e);
  if (state.mode === 'diff' && state.diffResult) return handleDiffKeydown(e);
  if (state.mode === 'pass2' || state.mode === 'review') return handlePass2Keydown(e);
  handlePass1Keydown(e);
});

// ---- Metadata strip ----
function metaPillGroup(label, cssClass, items) {
  if (!items || !items.length) return '';
  var html = '<div class="meta-group"><span class="meta-label">' + label + '</span>';
  for (var i = 0; i < items.length; i++) {
    html += '<span class="meta-pill ' + cssClass + '">' + escapeHtml(String(items[i])) + '</span>';
  }
  return html + '</div>';
}

function renderMetadata() {
  const strip = document.getElementById('metadata-strip');
  // In diff mode, show metadata from the pending (new) inventory
  const inv = state._pendingSieve?.inventory || state.inventory;
  if (!inv) { strip.innerHTML = ''; return; }

  strip.innerHTML =
    metaPillGroup('Cookies', 'cookies', inv.cookies)
    + metaPillGroup('localStorage', 'local-storage', inv.storage?.localStorage)
    + metaPillGroup('sessionStorage', 'session-storage', inv.storage?.sessionStorage)
    + metaPillGroup('Tabs', 'tabs', inv.tabs != null ? [inv.tabs] : []);
}

// ---- Util ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadBlob(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Init ----
document.getElementById('btn-sieve').addEventListener('click', doSieve);
document.getElementById('btn-navigate').addEventListener('click', doNavigate);
document.getElementById('btn-export').addEventListener('click', doExport);
document.getElementById('btn-export-glossary').addEventListener('click', doExportGlossary);

// Restore state on load
loadState();

// Restore explore mode button state
if (state.exploreMode) {
  var exploreBtn = document.getElementById('btn-explore-mode');
  exploreBtn.classList.add('btn-explore-active');
  exploreBtn.textContent = 'Explore ON';
}

// ---- Test API ----
// Controlled interface for e2e tests. Tests should use these instead of
// reaching into the global `state` object directly.
window.testAPI = {
  // Read-only accessors (return copies where applicable)
  getMode: function () { return state.mode; },
  getExploreMode: function () { return state.exploreMode; },
  getClassifications: function () { return Object.assign({}, state.classifications); },
  getGlossaryNames: function () { return JSON.parse(JSON.stringify(state.glossaryNames)); },
  getElementCount: function () { return state.inventory?.elements?.length || 0; },
  getElementTag: function (i) { return state.inventory?.elements?.[i]?.tag || null; },
  getCurrentElementTag: function () { return state.inventory?.elements?.[state.currentIndex]?.tag || null; },
  getPageUrl: function () { return state.pageUrl; },
  getObservationLog: function () { return JSON.parse(JSON.stringify(state.observationLog)); },
  getObservationLogLength: function () { return state.observationLog.length; },
  getResolveContext: function () {
    if (!state.resolveContext) return null;
    return {
      pairs: state.resolveContext.pairs.slice(),
      addedNew: state.resolveContext.addedNew.slice(),
      removedOld: state.resolveContext.removedOld.slice(),
      currentGroupIdx: state.resolveContext.currentGroupIdx,
      allGroupsLength: state.resolveContext.allGroups.length,
    };
  },
  getDiffResult: function () { return state.diffResult; },
  getDiffClass: function () { return state.diffClass; },
  getDiffSelectedIdx: function () { return state.diffSelectedIdx; },
  getCurrentIndex: function () { return state.currentIndex; },
  findElementIndexByTestId: function (testid) {
    if (!state.inventory || !state.inventory.elements) return -1;
    for (var i = 0; i < state.inventory.elements.length; i++) {
      if (state.inventory.elements[i].locators &&
          state.inventory.elements[i].locators.testid === testid) return i;
    }
    return -1;
  },
  getClassification: function (i) { return state.classifications[i] || null; },
  getLastObservation: function () {
    if (!state.observationLog.length) return null;
    return JSON.parse(JSON.stringify(state.observationLog[state.observationLog.length - 1]));
  },
  // Test fixture loader — sets internal state for test setup.
  // Accepts an object with any combination of: inventory, classifications,
  // glossaryNames, mode, exploreMode, pageUrl, currentIndex, observationLog,
  // resolveContext, diffResult, _pendingSieve, _exploreInProgress.
  injectTestState: function (fixture) {
    if (fixture.inventory !== undefined) state.inventory = fixture.inventory;
    if (fixture.classifications !== undefined) state.classifications = fixture.classifications;
    if (fixture.glossaryNames !== undefined) state.glossaryNames = fixture.glossaryNames;
    if (fixture.mode !== undefined) state.mode = fixture.mode;
    if (fixture.exploreMode !== undefined) state.exploreMode = fixture.exploreMode;
    if (fixture.pageUrl !== undefined) state.pageUrl = fixture.pageUrl;
    if (fixture.currentIndex !== undefined) state.currentIndex = fixture.currentIndex;
    if (fixture.observationLog !== undefined) state.observationLog = fixture.observationLog;
    if (fixture.resolveContext !== undefined) state.resolveContext = fixture.resolveContext;
    if (fixture.diffResult !== undefined) state.diffResult = fixture.diffResult;
    if (fixture._pendingSieve !== undefined) state._pendingSieve = fixture._pendingSieve;
    if (fixture._exploreInProgress !== undefined) state._exploreInProgress = fixture._exploreInProgress;
    if (fixture._preResolveMode !== undefined) state._preResolveMode = fixture._preResolveMode;
    if (fixture._preDiffMode !== undefined) state._preDiffMode = fixture._preDiffMode;
    if (fixture.screenshotDims !== undefined) state.screenshotDims = fixture.screenshotDims;
    renderOverlay();
    renderPanel();
  },
  // Test scenario builders — wrap internal functions for e2e test setup
  simulateResolve: function (oldState, newInventory) {
    state.inventory = oldState.inventory;
    state.classifications = oldState.classifications || {};
    state.glossaryNames = oldState.glossaryNames || {};
    state.mode = oldState.mode || 'pass1';
    var matchResult = matchElements(state.inventory.elements, newInventory.elements);
    var pendingSieve = {
      inventory: newInventory,
      screenshotUrl: oldState.screenshotUrl || null,
      matchResult: matchResult,
      oldInventory: state.inventory,
      oldClassifications: Object.assign({}, state.classifications),
      oldGlossaryNames: Object.assign({}, state.glossaryNames),
    };
    enterResolveMode(matchResult, pendingSieve);
  },
  simulateDiff: function (oldState, newInventory, screenshotUrl) {
    state.inventory = oldState.inventory;
    state.classifications = oldState.classifications || {};
    state.glossaryNames = oldState.glossaryNames || {};
    state.mode = oldState.mode || 'pass1';
    if (oldState.screenshotDims) state.screenshotDims = oldState.screenshotDims;
    var matchResult = matchElements(state.inventory.elements, newInventory.elements);
    var pendingSieve = {
      inventory: newInventory,
      screenshotUrl: screenshotUrl || null,
      matchResult: matchResult,
      oldInventory: state.inventory,
      oldClassifications: Object.assign({}, state.classifications),
      oldGlossaryNames: Object.assign({}, state.glossaryNames),
    };
    enterDiffMode(matchResult, pendingSieve, null);
  },
  jumpTo: function (index) { jumpTo(index); },
  diffSelectItem: function (index) { diffSelectItem(index); },
  // Controlled mutators — these go through proper state transitions
  resetToPass1: function () {
    if (state.mode === 'resolve') { state.resolveContext = null; state._pendingSieve = null; }
    if (state.mode === 'diff') { state.diffResult = null; state._pendingSieve = null; }
    state.mode = 'pass1';
    state.pass2Order = [];
    state.pass2Cursor = 0;
    state._preResolveMode = null;
    state._preDiffMode = null;
    _lastPass2Rendered = -1;
    renderOverlay();
    renderPanel();
  },
  setExploreMode: function (v) {
    state.exploreMode = !!v;
    var btn = document.getElementById('btn-explore-mode');
    btn.classList.toggle('btn-explore-active', state.exploreMode);
    btn.textContent = state.exploreMode ? 'Explore ON' : 'Explore';
    renderOverlay();
    saveState();
  },
  isExploreInProgress: function () { return !!state._exploreInProgress; },
  clearExploreInProgress: function () { state._exploreInProgress = false; },
  // UI action proxies — trigger proper state transitions
  resolveSelectOld: function (idx) { resolveSelectOld(idx); },
  resolveSelectNew: function (idx) { resolveSelectNew(idx); },
  resolveUndoPair: function (oldIdx, newIdx) { resolveUndoPair(oldIdx, newIdx); },
  resolveMarkOldRemoved: function (idx) { resolveMarkOldRemoved(idx); },
  resolveMarkNewAdded: function (idx) { resolveMarkNewAdded(idx); },
  areAllGroupsResolved: function () { return areAllGroupsResolved(); },
  finishResolve: function () { finishResolve(); },
  acceptDiff: function () { acceptDiff(); },
};

// Set initial mode indicator
updateModeIndicator();

// Try to get status on load
fetchStatus()
  .then(function (s) {
    if (s.url) document.getElementById('url-input').value = s.url;
    document.getElementById('status-indicator').textContent = 'Connected';
  })
  .catch(function () {
    document.getElementById('status-indicator').textContent = 'SL not connected';
  });
