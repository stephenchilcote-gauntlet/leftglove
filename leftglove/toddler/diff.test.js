// Tests for diff.js — element matching, diffing, and classification.
// Run: node --test leftglove/toddler/diff.test.js

const { describe, it } = require('node:test');
const { deepStrictEqual, strictEqual } = require('node:assert');
const {
  elementKey,
  matchElements,
  propagateNames,
  computeDiff,
  classifyDiff,
} = require('./diff');

// --- elementKey ---

describe('elementKey', function () {
  it('prefers testid', function () {
    strictEqual(
      elementKey({ locators: { testid: 'login-btn', id: 'btn-1' } }),
      'testid::login-btn'
    );
  });

  it('uses id when no testid and id is not dynamic', function () {
    strictEqual(
      elementKey({ locators: { id: 'main-nav' } }),
      'id::main-nav'
    );
  });

  it('skips dynamic ids and falls through to name', function () {
    strictEqual(
      elementKey({ locators: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'email' } }),
      'name::email'
    );
  });

  it('uses composite key when no stable locator', function () {
    strictEqual(
      elementKey({ tag: 'div', label: 'Submit', region: 'form', locators: {} }),
      'composite::form::div::Submit'
    );
  });

  it('handles missing locators', function () {
    strictEqual(
      elementKey({ tag: 'span', label: 'Hello' }),
      'composite::::span::Hello'
    );
  });
});

// --- matchElements ---

describe('matchElements', function () {
  var mkEl = function (testid) {
    return { tag: 'button', label: testid, locators: { testid: testid }, rect: { x: 0, y: 0, w: 10, h: 10 } };
  };

  it('matches 1:1 elements by key', function () {
    var old = [mkEl('a'), mkEl('b')];
    var neu = [mkEl('b'), mkEl('a')];
    var result = matchElements(old, neu);
    strictEqual(result.matched.length, 2);
    strictEqual(result.added.length, 0);
    strictEqual(result.removed.length, 0);
    strictEqual(result.ambiguous.length, 0);
  });

  it('detects added elements', function () {
    var old = [mkEl('a')];
    var neu = [mkEl('a'), mkEl('b')];
    var result = matchElements(old, neu);
    strictEqual(result.matched.length, 1);
    strictEqual(result.added.length, 1);
    strictEqual(result.added[0].key, 'testid::b');
  });

  it('detects removed elements', function () {
    var old = [mkEl('a'), mkEl('b')];
    var neu = [mkEl('a')];
    var result = matchElements(old, neu);
    strictEqual(result.matched.length, 1);
    strictEqual(result.removed.length, 1);
    strictEqual(result.removed[0].key, 'testid::b');
  });

  it('flags ambiguous when multiple elements share a key', function () {
    var el = { tag: 'div', label: 'item', locators: {}, region: 'list' };
    var old = [el, el];
    var neu = [el, el, el];
    var result = matchElements(old, neu);
    strictEqual(result.ambiguous.length, 1);
    deepStrictEqual(result.ambiguous[0].oldIdxs, [0, 1]);
    deepStrictEqual(result.ambiguous[0].newIdxs, [0, 1, 2]);
  });
});

// --- propagateNames ---

describe('propagateNames', function () {
  it('carries classifications and glossary names from old to new via match pairs', function () {
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 2 }, { oldIdx: 1, newIdx: 0 }] };
    var oldCls = { 0: 'clickable', 1: 'readable' };
    var oldNames = { 0: { name: 'login-btn', intent: 'Login', source: 'human', notes: '' } };
    var result = propagateNames(matchResult, oldCls, oldNames, []);
    deepStrictEqual(result.classifications, { 2: 'clickable', 0: 'readable' });
    strictEqual(result.glossaryNames[2].name, 'login-btn');
    strictEqual(result.glossaryNames[0], undefined);
  });

  it('includes resolved pairs', function () {
    var matchResult = { matched: [] };
    var oldCls = { 3: 'typable' };
    var resolved = [{ oldIdx: 3, newIdx: 1 }];
    var result = propagateNames(matchResult, oldCls, {}, resolved);
    deepStrictEqual(result.classifications, { 1: 'typable' });
  });
});

// --- computeDiff ---

describe('computeDiff', function () {
  var mkEl = function (label, x) {
    return { tag: 'div', label: label, region: 'main', rect: { x: x || 0, y: 0, w: 100, h: 20 }, state: { visible: true } };
  };

  it('reports unchanged when elements are identical', function () {
    var els = [mkEl('A', 10), mkEl('B', 50)];
    var matchResult = {
      matched: [{ oldIdx: 0, newIdx: 0, key: 'k1' }, { oldIdx: 1, newIdx: 1, key: 'k2' }],
      added: [], removed: [],
    };
    var diff = computeDiff(els, els, matchResult);
    strictEqual(diff.unchanged.length, 2);
    strictEqual(diff.changed.length, 0);
    strictEqual(diff.added.length, 0);
    strictEqual(diff.removed.length, 0);
  });

  it('detects label changes', function () {
    var old = [mkEl('Old Label')];
    var neu = [mkEl('New Label')];
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 0, key: 'k' }], added: [], removed: [] };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.changed.length, 1);
    strictEqual(diff.changed[0].changes[0].includes('label'), true);
  });

  it('detects moved elements (>5px tolerance)', function () {
    var old = [mkEl('A', 10)];
    var neu = [mkEl('A', 20)];
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 0, key: 'k' }], added: [], removed: [] };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.changed.length, 1);
    strictEqual(diff.changed[0].changes[0], 'moved/resized');
  });

  it('tolerates small position changes (<=5px)', function () {
    var old = [mkEl('A', 10)];
    var neu = [mkEl('A', 15)];
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 0, key: 'k' }], added: [], removed: [] };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.unchanged.length, 1);
  });

  it('detects visible text changes', function () {
    var old = [{ tag: 'p', label: 'A', region: 'main', visibleText: 'Hello', rect: { x: 0, y: 0, w: 100, h: 20 }, state: { visible: true } }];
    var neu = [{ tag: 'p', label: 'A', region: 'main', visibleText: 'World', rect: { x: 0, y: 0, w: 100, h: 20 }, state: { visible: true } }];
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 0, key: 'k' }], added: [], removed: [] };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.changed.length, 1);
    strictEqual(diff.changed[0].changes[0], 'text changed');
  });

  it('detects state changes (disabled, checked)', function () {
    var old = [{ tag: 'input', label: 'A', region: 'main', rect: { x: 0, y: 0, w: 100, h: 20 }, state: { visible: true, disabled: false } }];
    var neu = [{ tag: 'input', label: 'A', region: 'main', rect: { x: 0, y: 0, w: 100, h: 20 }, state: { visible: true, disabled: true } }];
    var matchResult = { matched: [{ oldIdx: 0, newIdx: 0, key: 'k' }], added: [], removed: [] };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.changed.length, 1);
    strictEqual(diff.changed[0].changes[0].includes('disabled'), true);
  });

  it('includes added and removed from matchResult', function () {
    var old = [mkEl('Gone')];
    var neu = [mkEl('New')];
    var matchResult = {
      matched: [],
      added: [{ newIdx: 0, key: 'k1' }],
      removed: [{ oldIdx: 0, key: 'k2' }],
    };
    var diff = computeDiff(old, neu, matchResult);
    strictEqual(diff.added.length, 1);
    strictEqual(diff.removed.length, 1);
    strictEqual(diff.added[0].el.label, 'New');
    strictEqual(diff.removed[0].el.label, 'Gone');
  });
});

// --- classifyDiff ---

describe('classifyDiff', function () {
  var mkDiff = function (added, removed, changed, unchanged) {
    return {
      added: new Array(added).fill({}),
      removed: new Array(removed).fill({}),
      changed: new Array(changed).fill({}),
      unchanged: new Array(unchanged).fill({}),
    };
  };

  it('returns no-effect when nothing changed', function () {
    strictEqual(classifyDiff(mkDiff(0, 0, 0, 5), '/a', '/a'), 'no-effect');
  });

  it('returns reveal when only additions', function () {
    strictEqual(classifyDiff(mkDiff(3, 0, 0, 5), '/a', '/a'), 'reveal');
  });

  it('returns conceal when only removals', function () {
    strictEqual(classifyDiff(mkDiff(0, 3, 0, 5), '/a', '/a'), 'conceal');
  });

  it('returns state-mutation when only changes', function () {
    strictEqual(classifyDiff(mkDiff(0, 0, 2, 5), '/a', '/a'), 'state-mutation');
  });

  it('returns navigation when URL changed and >50% elements changed', function () {
    strictEqual(classifyDiff(mkDiff(8, 8, 0, 2), '/a', '/b'), 'navigation');
  });

  it('returns compound when mix of add/remove/change', function () {
    strictEqual(classifyDiff(mkDiff(1, 1, 1, 5), '/a', '/a'), 'compound');
  });
});
