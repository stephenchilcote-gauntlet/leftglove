// Tests for intermediate.js — serialization, parsing, validation, round-trip.
// Run: node --test leftglove/toddler/intermediate.test.js

const { describe, it } = require('node:test');
const { deepStrictEqual, strictEqual, ok } = require('node:assert');
const {
  validateIntermediate,
  toIntermediate,
  parseIntermediate,
} = require('./intermediate');

// --- helpers ---

function mkElement(label, opts) {
  return Object.assign({
    tag: 'button',
    'element-type': 'button',
    label: label,
    category: ':clickable',
    locators: { testid: label },
    state: { visible: true, disabled: false },
    visibleText: label,
    rect: { x: 10, y: 20, w: 100, h: 30 },
    region: 'main',
    form: null,
    'aria-role': 'button',
  }, opts || {});
}

function mkState(overrides) {
  var el = mkElement('Submit');
  return Object.assign({
    inventory: {
      elements: [el],
      viewport: { w: 1280, h: 720 },
      cookies: [],
      storage: { localStorage: [], sessionStorage: [] },
      tabs: 1,
      url: { raw: 'http://example.com/page' },
    },
    classifications: { 0: 'clickable' },
    glossaryNames: {},
    pageUrl: 'http://example.com/page',
    screenshotUrl: 'data:image/png;base64,abc',
    screenshotDims: { w: 1280, h: 720 },
  }, overrides || {});
}

function mkIntermediate(overrides) {
  return Object.assign({
    'sieve-version': '1.0',
    'source': {
      'url': 'http://example.com/page',
      'viewport': { 'w': 1280, 'h': 720 },
      'timestamp': '2026-01-01T00:00:00.000Z',
      'screenshot': 'data:image/png;base64,abc',
    },
    'elements': [{
      'sieve-id': 'el-001',
      'category': 'clickable',
      'category-source': 'human',
      'tag': 'button',
      'element-type': 'button',
      'label': 'Submit',
      'locators': { testid: 'Submit' },
      'state': { visible: true, disabled: false },
      'rect': { x: 10, y: 20, w: 100, h: 30 },
      'visible-text': 'Submit',
      'region': 'main',
      'form': null,
      'aria-role': 'button',
      'glossary-name': null,
      'glossary-intent': null,
      'glossary-source': null,
      'notes': null,
    }],
    'metadata': {
      'cookies': [],
      'storage': { 'localStorage': [], 'sessionStorage': [] },
      'tabs': 1,
    },
    'pass-1-complete': true,
    'pass-2-progress': 0,
  }, overrides || {});
}

// --- validateIntermediate ---

describe('validateIntermediate', function () {
  it('accepts valid data', function () {
    deepStrictEqual(validateIntermediate(mkIntermediate()), []);
  });

  it('rejects null', function () {
    var errors = validateIntermediate(null);
    ok(errors.length > 0);
  });

  it('rejects missing sieve-version', function () {
    var data = mkIntermediate();
    delete data['sieve-version'];
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('sieve-version'); }));
  });

  it('rejects missing source.url', function () {
    var data = mkIntermediate();
    data.source.url = '';
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('source.url'); }));
  });

  it('rejects missing source.viewport', function () {
    var data = mkIntermediate();
    data.source.viewport = null;
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('viewport'); }));
  });

  it('rejects missing elements array', function () {
    var data = mkIntermediate();
    data.elements = 'not-array';
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('elements'); }));
  });

  it('rejects element missing sieve-id', function () {
    var data = mkIntermediate();
    delete data.elements[0]['sieve-id'];
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('sieve-id'); }));
  });

  it('rejects element missing rect', function () {
    var data = mkIntermediate();
    data.elements[0].rect = null;
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('rect'); }));
  });

  it('rejects missing metadata', function () {
    var data = mkIntermediate();
    delete data.metadata;
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('metadata'); }));
  });

  it('rejects missing pass-1-complete', function () {
    var data = mkIntermediate();
    delete data['pass-1-complete'];
    var errors = validateIntermediate(data);
    ok(errors.some(function (e) { return e.includes('pass-1-complete'); }));
  });
});

// --- toIntermediate ---

describe('toIntermediate', function () {
  it('returns null when no inventory', function () {
    strictEqual(toIntermediate({ inventory: null, classifications: {}, glossaryNames: {} }), null);
  });

  it('serializes state to intermediate format', function () {
    var st = mkState();
    var result = toIntermediate(st);
    strictEqual(result['sieve-version'], '1.0');
    strictEqual(result.source.url, 'http://example.com/page');
    strictEqual(result.source.viewport.w, 1280);
    strictEqual(result.elements.length, 1);
    strictEqual(result.elements[0].category, 'clickable');
    strictEqual(result.elements[0]['category-source'], 'human');
    strictEqual(result.elements[0].tag, 'button');
    strictEqual(result.elements[0].label, 'Submit');
    strictEqual(result['pass-1-complete'], true);
  });

  it('uses sieve category when no human classification', function () {
    var st = mkState({ classifications: {} });
    var result = toIntermediate(st);
    strictEqual(result.elements[0].category, 'clickable');
    strictEqual(result.elements[0]['category-source'], 'sieve');
  });

  it('includes glossary names', function () {
    var st = mkState({
      glossaryNames: { 0: { name: 'submit-btn', intent: 'Login', source: 'human', notes: 'main CTA' } },
    });
    var result = toIntermediate(st);
    strictEqual(result.elements[0]['glossary-name'], 'submit-btn');
    strictEqual(result.elements[0]['glossary-intent'], 'Login');
    strictEqual(result.elements[0]['glossary-source'], 'human');
    strictEqual(result.elements[0].notes, 'main CTA');
    strictEqual(result['pass-2-progress'], 1);
  });

  it('handles element with no glossary entry (undefined key)', function () {
    var el2 = mkElement('Other');
    var st = mkState();
    st.inventory.elements = [mkElement('Submit'), el2];
    st.classifications = { 0: 'clickable', 1: 'readable' };
    st.glossaryNames = { 0: { name: 'submit-btn', intent: 'Login', source: 'human', notes: '' } };
    var result = toIntermediate(st);
    strictEqual(result.elements[1]['glossary-name'], null);
    strictEqual(result.elements[1]['glossary-intent'], null);
    strictEqual(result.elements[1]['glossary-source'], null);
    strictEqual(result.elements[1].notes, null);
  });

  it('normalizes empty-string glossary fields to null', function () {
    var st = mkState({
      glossaryNames: { 0: { name: 'btn', intent: '', source: 'human', notes: '' } },
    });
    var result = toIntermediate(st);
    strictEqual(result.elements[0]['glossary-name'], 'btn');
    // Empty strings are normalized to null by the || null pattern
    strictEqual(result.elements[0]['glossary-intent'], null);
    strictEqual(result.elements[0]['glossary-source'], 'human');
    strictEqual(result.elements[0].notes, null);
  });

  it('preserves visible-text', function () {
    var st = mkState();
    var result = toIntermediate(st);
    strictEqual(result.elements[0]['visible-text'], 'Submit');
  });

  it('preserves element state', function () {
    var st = mkState();
    st.inventory.elements[0].state = { visible: true, disabled: true, checked: true };
    var result = toIntermediate(st);
    deepStrictEqual(result.elements[0].state, { visible: true, disabled: true, checked: true });
  });
});

// --- parseIntermediate ---

describe('parseIntermediate', function () {
  it('returns errors for invalid data', function () {
    var result = parseIntermediate(null);
    ok(result.errors);
    ok(result.errors.length > 0);
  });

  it('parses valid intermediate data', function () {
    var data = mkIntermediate();
    var result = parseIntermediate(data);
    ok(!result.errors);
    strictEqual(result.inventory.elements.length, 1);
    strictEqual(result.inventory.elements[0].tag, 'button');
    strictEqual(result.inventory.elements[0].label, 'Submit');
    strictEqual(result.pageUrl, 'http://example.com/page');
    strictEqual(result.screenshotUrl, 'data:image/png;base64,abc');
  });

  it('restores human classifications', function () {
    var data = mkIntermediate();
    var result = parseIntermediate(data);
    deepStrictEqual(result.classifications, { 0: 'clickable' });
  });

  it('skips sieve classifications', function () {
    var data = mkIntermediate();
    data.elements[0]['category-source'] = 'sieve';
    var result = parseIntermediate(data);
    deepStrictEqual(result.classifications, {});
  });

  it('restores glossary names', function () {
    var data = mkIntermediate();
    data.elements[0]['glossary-name'] = 'submit-btn';
    data.elements[0]['glossary-intent'] = 'Login';
    data.elements[0]['glossary-source'] = 'human';
    data.elements[0].notes = 'main CTA';
    var result = parseIntermediate(data);
    deepStrictEqual(result.glossaryNames, {
      0: { name: 'submit-btn', intent: 'Login', source: 'human', notes: 'main CTA' },
    });
  });

  it('preserves visible-text', function () {
    var data = mkIntermediate();
    var result = parseIntermediate(data);
    strictEqual(result.inventory.elements[0].visibleText, 'Submit');
  });

  it('preserves element state', function () {
    var data = mkIntermediate();
    data.elements[0].state = { visible: false, disabled: true };
    var result = parseIntermediate(data);
    deepStrictEqual(result.inventory.elements[0].state, { visible: false, disabled: true });
  });

  it('handles null screenshot', function () {
    var data = mkIntermediate();
    data.source.screenshot = null;
    var result = parseIntermediate(data);
    strictEqual(result.screenshotUrl, null);
  });
});

// --- round-trip ---

describe('round-trip', function () {
  it('toIntermediate → parseIntermediate preserves all element fields', function () {
    var st = mkState({
      glossaryNames: { 0: { name: 'submit-btn', intent: 'Login', source: 'human', notes: 'CTA' } },
    });
    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    ok(!parsed.errors);

    var origEl = st.inventory.elements[0];
    var roundEl = parsed.inventory.elements[0];
    strictEqual(roundEl.tag, origEl.tag);
    strictEqual(roundEl.label, origEl.label);
    strictEqual(roundEl.region, origEl.region);
    strictEqual(roundEl.form, origEl.form);
    strictEqual(roundEl['aria-role'], origEl['aria-role']);
    strictEqual(roundEl['element-type'], origEl['element-type']);
    strictEqual(roundEl.visibleText, origEl.visibleText);
    deepStrictEqual(roundEl.rect, origEl.rect);
    deepStrictEqual(roundEl.state, origEl.state);
    deepStrictEqual(roundEl.locators, origEl.locators);
  });

  it('toIntermediate → parseIntermediate preserves classifications', function () {
    var st = mkState({ classifications: { 0: 'clickable' } });
    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    deepStrictEqual(parsed.classifications, st.classifications);
  });

  it('toIntermediate → parseIntermediate preserves glossary names', function () {
    var st = mkState({
      glossaryNames: { 0: { name: 'submit-btn', intent: 'Login', source: 'human', notes: 'CTA' } },
    });
    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    deepStrictEqual(parsed.glossaryNames, st.glossaryNames);
  });

  it('toIntermediate → parseIntermediate preserves URL', function () {
    var st = mkState({ pageUrl: 'http://other.com/path' });
    st.inventory.url = { raw: 'http://other.com/path' };
    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    strictEqual(parsed.pageUrl, 'http://other.com/path');
  });

  it('toIntermediate → parseIntermediate preserves metadata', function () {
    var st = mkState();
    st.inventory.cookies = [{ name: 'sid', value: '123' }];
    st.inventory.tabs = 3;
    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    deepStrictEqual(parsed.inventory.cookies, [{ name: 'sid', value: '123' }]);
    strictEqual(parsed.inventory.tabs, 3);
  });

  it('round-trips multiple elements with mixed classifications', function () {
    var el1 = mkElement('A');
    var el2 = mkElement('B', { category: ':readable' });
    var el3 = mkElement('C', { category: ':chrome' });
    var st = mkState();
    st.inventory.elements = [el1, el2, el3];
    st.classifications = { 0: 'clickable', 2: 'chrome' };
    st.glossaryNames = { 0: { name: 'a-btn', intent: 'Login', source: 'human', notes: '' } };

    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    ok(!parsed.errors);
    strictEqual(parsed.inventory.elements.length, 3);
    // el-0: human classification
    strictEqual(parsed.classifications[0], 'clickable');
    // el-1: sieve classification (not in parsed.classifications)
    strictEqual(parsed.classifications[1], undefined);
    // el-2: human classification
    strictEqual(parsed.classifications[2], 'chrome');
    // glossary
    strictEqual(parsed.glossaryNames[0].name, 'a-btn');
    strictEqual(parsed.glossaryNames[1], undefined);
  });

  it('round-trips element with minimal/null fields', function () {
    var sparseEl = mkElement('Bare', {
      'element-type': null,
      locators: {},
      state: { visible: true },
      visibleText: null,
      region: null,
      form: null,
      'aria-role': null,
    });
    var st = mkState();
    st.inventory.elements = [sparseEl];
    st.classifications = {};
    st.glossaryNames = {};

    var intermediate = toIntermediate(st);
    var parsed = parseIntermediate(intermediate);
    ok(!parsed.errors);
    var el = parsed.inventory.elements[0];
    strictEqual(el.tag, 'button');
    strictEqual(el.label, 'Bare');
    strictEqual(el['element-type'], null);
    strictEqual(el.region, null);
    strictEqual(el.form, null);
    strictEqual(el['aria-role'], null);
    strictEqual(el.visibleText, null);
    deepStrictEqual(el.locators, {});
  });

  it('round-trips empty glossary names (no pass2 data)', function () {
    var st = mkState({ glossaryNames: {} });
    var intermediate = toIntermediate(st);
    strictEqual(intermediate['pass-2-progress'], 0);
    var parsed = parseIntermediate(intermediate);
    ok(!parsed.errors);
    deepStrictEqual(parsed.glossaryNames, {});
  });

  it('round-trips glossary with empty intent/notes (normalizes through null)', function () {
    var st = mkState({
      glossaryNames: { 0: { name: 'submit-btn', intent: '', source: 'human', notes: '' } },
    });
    var intermediate = toIntermediate(st);
    // Empty strings normalized to null in intermediate format
    strictEqual(intermediate.elements[0]['glossary-intent'], null);
    strictEqual(intermediate.elements[0].notes, null);
    // Parse restores null → '' via || '' pattern
    var parsed = parseIntermediate(intermediate);
    ok(!parsed.errors);
    strictEqual(parsed.glossaryNames[0].intent, '');
    strictEqual(parsed.glossaryNames[0].notes, '');
    strictEqual(parsed.glossaryNames[0].name, 'submit-btn');
  });
});

// --- Property-based tests ---

var fc;
try { fc = require('fast-check'); } catch (_) { fc = null; }

if (fc) {
  var pbtPassed = 0;
  var pbtFailed = 0;

  function prop(name, arb, predicate) {
    try {
      fc.assert(fc.property(arb, predicate), { numRuns: 200 });
      console.log('  \x1b[32mPASS\x1b[0m ' + name);
      pbtPassed++;
    } catch (e) {
      console.log('  \x1b[31mFAIL\x1b[0m ' + name);
      console.log('    ' + e.message.split('\n').slice(0, 5).join('\n    '));
      pbtFailed++;
    }
  }

  // Arbitraries
  var arbLabel = fc.string({ minLength: 0, maxLength: 50 });
  var arbTag = fc.constantFrom('button', 'input', 'a', 'div', 'span', 'select', 'textarea', 'p', 'h1');
  var arbCat = fc.constantFrom('clickable', 'typable', 'readable', 'chrome', 'custom', 'split', 'skip');
  var arbRect = fc.record({
    x: fc.integer({ min: 0, max: 2000 }),
    y: fc.integer({ min: 0, max: 2000 }),
    w: fc.integer({ min: 1, max: 500 }),
    h: fc.integer({ min: 1, max: 500 }),
  });
  var arbElement = fc.record({
    tag: arbTag,
    label: arbLabel,
    category: arbCat.map(function (c) { return ':' + c; }),
    rect: arbRect,
    locators: fc.constant({}),
    state: fc.record({ visible: fc.boolean(), disabled: fc.boolean() }),
    visibleText: fc.option(arbLabel, { nil: null }),
    region: fc.option(fc.constantFrom('header', 'main', 'footer', 'sidebar', 'nav'), { nil: null }),
    form: fc.constant(null),
    'element-type': fc.option(fc.constantFrom('button', 'text', 'password', 'checkbox'), { nil: null }),
    'aria-role': fc.option(fc.constantFrom('button', 'textbox', 'link', 'navigation'), { nil: null }),
  });

  var arbState = fc.record({
    elements: fc.array(arbElement, { minLength: 1, maxLength: 10 }),
    cats: fc.array(arbCat, { minLength: 1, maxLength: 10 }),
    hasNames: fc.boolean(),
  }).chain(function (r) {
    var els = r.elements;
    var cls = {};
    for (var i = 0; i < els.length; i++) {
      cls[i] = r.cats[i % r.cats.length];
    }
    var gn = {};
    if (r.hasNames) {
      gn[0] = { name: 'test-name', intent: 'TestIntent', source: 'human', notes: '' };
    }
    return fc.constant({
      inventory: {
        elements: els,
        viewport: { w: 1280, h: 720 },
        cookies: [],
        storage: { localStorage: [], sessionStorage: [] },
        tabs: 1,
        url: { raw: 'http://example.com' },
      },
      classifications: cls,
      glossaryNames: gn,
      pageUrl: 'http://example.com',
      screenshotUrl: null,
      screenshotDims: { w: 1280, h: 720 },
    });
  });

  console.log('\n=== Intermediate PBT ===\n');

  prop('toIntermediate always returns valid intermediate format', arbState, function (st) {
    var data = toIntermediate(st);
    if (!data) return false;
    var errors = validateIntermediate(data);
    return errors.length === 0;
  });

  prop('round-trip preserves element count', arbState, function (st) {
    var data = toIntermediate(st);
    var parsed = parseIntermediate(data);
    return !parsed.errors && parsed.inventory.elements.length === st.inventory.elements.length;
  });

  prop('round-trip preserves element tags', arbState, function (st) {
    var data = toIntermediate(st);
    var parsed = parseIntermediate(data);
    if (parsed.errors) return false;
    for (var i = 0; i < st.inventory.elements.length; i++) {
      if (parsed.inventory.elements[i].tag !== st.inventory.elements[i].tag) return false;
    }
    return true;
  });

  prop('round-trip preserves element rects', arbState, function (st) {
    var data = toIntermediate(st);
    var parsed = parseIntermediate(data);
    if (parsed.errors) return false;
    for (var i = 0; i < st.inventory.elements.length; i++) {
      var a = st.inventory.elements[i].rect;
      var b = parsed.inventory.elements[i].rect;
      if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) return false;
    }
    return true;
  });

  prop('round-trip preserves human classifications', arbState, function (st) {
    var data = toIntermediate(st);
    var parsed = parseIntermediate(data);
    if (parsed.errors) return false;
    for (var key in st.classifications) {
      if (parsed.classifications[key] !== st.classifications[key]) return false;
    }
    return true;
  });

  prop('round-trip preserves element state', arbState, function (st) {
    var data = toIntermediate(st);
    var parsed = parseIntermediate(data);
    if (parsed.errors) return false;
    for (var i = 0; i < st.inventory.elements.length; i++) {
      var a = st.inventory.elements[i].state;
      var b = parsed.inventory.elements[i].state;
      if (JSON.stringify(a) !== JSON.stringify(b)) return false;
    }
    return true;
  });

  prop('toIntermediate output is JSON-serializable', arbState, function (st) {
    var data = toIntermediate(st);
    try {
      var json = JSON.stringify(data);
      var reparsed = JSON.parse(json);
      return reparsed['sieve-version'] === '1.0';
    } catch (_) {
      return false;
    }
  });

  console.log('\n' + (pbtPassed + pbtFailed) + ' properties, ' + pbtPassed + ' passed, ' + pbtFailed + ' failed.\n');
  if (pbtFailed > 0) process.exit(1);
}
