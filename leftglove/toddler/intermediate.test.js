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
});
