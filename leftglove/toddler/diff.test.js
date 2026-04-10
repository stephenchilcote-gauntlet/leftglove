// Tests for diff.js — element matching, diffing, and classification.
// Run: node --test leftglove/toddler/diff.test.js

const { describe, it } = require('node:test');
const { deepStrictEqual, strictEqual, ok } = require('node:assert');
const fc = require('fast-check');
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

// --- Property-based tests ---

var arbElement = fc.record({
  tag: fc.constantFrom('div', 'button', 'input', 'a', 'span', 'p'),
  label: fc.string({ minLength: 0, maxLength: 30 }),
  region: fc.constantFrom('header', 'main', 'footer', 'sidebar', ''),
  locators: fc.oneof(
    fc.record({ testid: fc.string({ minLength: 1, maxLength: 20 }) }),
    fc.record({ id: fc.string({ minLength: 1, maxLength: 20 }) }),
    fc.record({ name: fc.string({ minLength: 1, maxLength: 20 }) }),
    fc.constant({})
  ),
  rect: fc.record({
    x: fc.integer({ min: 0, max: 1920 }),
    y: fc.integer({ min: 0, max: 1080 }),
    w: fc.integer({ min: 1, max: 500 }),
    h: fc.integer({ min: 1, max: 500 }),
  }),
  visibleText: fc.oneof(fc.string({ maxLength: 50 }), fc.constant('')),
  state: fc.record({ visible: fc.boolean(), disabled: fc.boolean() }),
});

describe('PBT: matchElements', function () {
  it('accounts for all old and new indices', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 0, maxLength: 15 }),
      fc.array(arbElement, { minLength: 0, maxLength: 15 }),
      function (oldEls, newEls) {
        var result = matchElements(oldEls, newEls);

        // Every old index must appear in exactly one bucket
        var oldSeen = new Set();
        result.matched.forEach(function (m) { oldSeen.add(m.oldIdx); });
        result.removed.forEach(function (r) { oldSeen.add(r.oldIdx); });
        result.ambiguous.forEach(function (a) {
          a.oldIdxs.forEach(function (i) { oldSeen.add(i); });
        });
        strictEqual(oldSeen.size, oldEls.length, 'all old indices accounted for');

        // Every new index must appear in exactly one bucket
        var newSeen = new Set();
        result.matched.forEach(function (m) { newSeen.add(m.newIdx); });
        result.added.forEach(function (a) { newSeen.add(a.newIdx); });
        result.ambiguous.forEach(function (a) {
          a.newIdxs.forEach(function (i) { newSeen.add(i); });
        });
        strictEqual(newSeen.size, newEls.length, 'all new indices accounted for');
      }
    ), { numRuns: 200 });
  });

  it('matched pairs have same key', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 1, maxLength: 15 }),
      fc.array(arbElement, { minLength: 1, maxLength: 15 }),
      function (oldEls, newEls) {
        var result = matchElements(oldEls, newEls);
        result.matched.forEach(function (m) {
          strictEqual(elementKey(oldEls[m.oldIdx]), elementKey(newEls[m.newIdx]),
            'matched elements share the same key');
        });
      }
    ), { numRuns: 200 });
  });

  it('self-match produces all matched (unique keys) or ambiguous (dup keys)', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      function (els) {
        var result = matchElements(els, els);
        strictEqual(result.added.length, 0, 'no added when matching self');
        strictEqual(result.removed.length, 0, 'no removed when matching self');
      }
    ), { numRuns: 200 });
  });
});

describe('PBT: computeDiff', function () {
  it('categories are exhaustive (all matched elements appear in changed or unchanged)', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      function (oldEls, newEls) {
        var match = matchElements(oldEls, newEls);
        var diff = computeDiff(oldEls, newEls, match);

        // changed + unchanged should equal matched count
        strictEqual(
          diff.changed.length + diff.unchanged.length,
          match.matched.length,
          'changed + unchanged = matched'
        );
        strictEqual(diff.added.length, match.added.length, 'added counts match');
        strictEqual(diff.removed.length, match.removed.length, 'removed counts match');
      }
    ), { numRuns: 200 });
  });

  it('classifyDiff always returns a valid classification', function () {
    var validClasses = ['no-effect', 'navigation', 'reveal', 'conceal', 'state-mutation', 'compound'];
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 0, maxLength: 10 }),
      fc.array(arbElement, { minLength: 0, maxLength: 10 }),
      fc.string(), fc.string(),
      function (oldEls, newEls, urlA, urlB) {
        var match = matchElements(oldEls, newEls);
        var diff = computeDiff(oldEls, newEls, match);
        var cls = classifyDiff(diff, urlA, urlB);
        ok(validClasses.indexOf(cls) >= 0, 'classification is valid: ' + cls);
      }
    ), { numRuns: 200 });
  });
});

describe('PBT: propagateNames', function () {
  it('carries all classifications from matched pairs', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      function (els) {
        // Self-match: every unique-key element gets matched
        var match = matchElements(els, els);
        var oldCls = {};
        var cats = ['clickable', 'typable', 'readable', 'chrome', 'custom'];
        match.matched.forEach(function (m) {
          oldCls[m.oldIdx] = cats[m.oldIdx % cats.length];
        });
        var result = propagateNames(match, oldCls, {}, []);
        match.matched.forEach(function (m) {
          strictEqual(result.classifications[m.newIdx], oldCls[m.oldIdx],
            'classification carried for matched pair');
        });
      }
    ), { numRuns: 200 });
  });

  it('never invents classifications or names', function () {
    fc.assert(fc.property(
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      fc.array(arbElement, { minLength: 1, maxLength: 10 }),
      function (oldEls, newEls) {
        var match = matchElements(oldEls, newEls);
        var result = propagateNames(match, {}, {}, []);
        strictEqual(Object.keys(result.classifications).length, 0, 'no classifications from empty');
        strictEqual(Object.keys(result.glossaryNames).length, 0, 'no names from empty');
      }
    ), { numRuns: 200 });
  });
});
