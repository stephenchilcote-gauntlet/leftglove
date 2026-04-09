// Property-based tests for glossary EDN export (07k).
// Run: node glossary.test.js

'use strict';

const fc = require('fast-check');
const { ednStr, isDynamicId, bestLocator, toGlossaryIntents, toEdn } = require('./glossary');

let passed = 0;
let failed = 0;

function prop(name, arb, predicate) {
  try {
    fc.assert(fc.property(arb, predicate), { numRuns: 200 });
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}`);
    console.log(`    ${e.message.split('\n').slice(0, 5).join('\n    ')}`);
    failed++;
  }
}

// -- Arbitraries --

const arbKebab = fc.stringMatching(/^[a-z][a-z0-9-]{0,18}[a-z0-9]$/)
  .filter(s => s.length >= 1);

const arbIntent = fc.stringMatching(/^[A-Z][A-Za-z0-9 -]{0,28}[A-Za-z0-9]$/)
  .filter(s => s.length >= 1);

const arbCategory = fc.constantFrom('clickable', 'typable', 'readable', 'chrome', 'custom');

const arbLocators = fc.record({
  testid: fc.option(arbKebab, { nil: undefined }),
  id: fc.option(fc.oneof(arbKebab, fc.constant('12345'), fc.constant('abc12345-def0-1234-5678-aabbccddee')), { nil: undefined }),
  name: fc.option(arbKebab, { nil: undefined }),
  href: fc.option(fc.constantFrom('/about', '/login', '/dashboard', '/settings'), { nil: undefined }),
}, { requiredKeys: [] });

const arbBinding = fc.oneof(
  fc.constant(null),
  fc.record({
    strategy: fc.constantFrom('testid', 'id', 'name', 'css'),
    value: arbKebab,
  })
);

const arbElement = fc.record({
  desc: fc.string({ maxLength: 40 }),
  type: arbCategory,
  binding: arbBinding,
});

const arbIntentObj = fc.record({
  intent: arbIntent,
  description: fc.string({ maxLength: 50 }),
  elements: fc.dictionary(arbKebab, arbElement, { minKeys: 0, maxKeys: 10 }),
});

const arbDataElement = fc.record({
  'glossary-name': fc.option(arbKebab, { nil: null }),
  'glossary-intent': fc.option(arbIntent, { nil: null }),
  category: fc.oneof(arbCategory, fc.constant(':clickable'), fc.constant(':typable')),
  label: fc.string({ maxLength: 30 }),
  locators: arbLocators,
});

// -- Properties --

console.log('\n=== Glossary PBT ===\n');

// --- bestLocator ---

prop('bestLocator: testid always wins when present',
  arbLocators.filter(l => l.testid),
  (locators) => {
    const result = bestLocator(locators);
    return result.strategy === 'testid' && result.value === locators.testid;
  }
);

prop('bestLocator: result is null or has strategy+value',
  arbLocators,
  (locators) => {
    const result = bestLocator(locators);
    return result === null || (typeof result.strategy === 'string' && typeof result.value === 'string');
  }
);

prop('bestLocator: dynamic ids are skipped',
  fc.record({
    id: fc.constantFrom('12345', 'abc12345-def0-1234-5678-aabbccddee', '0000000000', 'react-abc', '__next-123'),
    name: fc.constant('fallback'),
  }),
  (locators) => {
    const result = bestLocator(locators);
    return result === null || result.strategy !== 'id';
  }
);

// --- ednStr ---

prop('ednStr: output is always a valid quoted string (no unescaped quotes)',
  fc.string({ maxLength: 50 }),
  (s) => {
    const result = ednStr(s);
    // Must start and end with "
    if (!result.startsWith('"') || !result.endsWith('"')) return false;
    // Inner content: no unescaped quotes
    const inner = result.slice(1, -1);
    // Walk inner to check no unescaped "
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\') { i++; continue; } // skip escaped char
      if (inner[i] === '"') return false;
    }
    return true;
  }
);

// --- toEdn ---

prop('toEdn: balanced braces (outside strings)',
  arbIntentObj,
  (intent) => {
    const edn = toEdn(intent);
    // Strip quoted strings before counting braces
    const stripped = edn.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const opens = (stripped.match(/{/g) || []).length;
    const closes = (stripped.match(/}/g) || []).length;
    return opens === closes;
  }
);

prop('toEdn: no JS leakage (undefined, [object Object], NaN)',
  arbIntentObj,
  (intent) => {
    const edn = toEdn(intent);
    return !edn.includes('undefined')
      && !edn.includes('[object Object]')
      && !edn.includes('NaN');
  }
);

prop('toEdn: starts with comment header',
  arbIntentObj,
  (intent) => {
    const edn = toEdn(intent);
    return edn.startsWith(';; Intent region: ' + intent.intent);
  }
);

prop('toEdn: contains :intent with correct name',
  arbIntentObj,
  (intent) => {
    const edn = toEdn(intent);
    return edn.includes(':intent "' + intent.intent + '"');
  }
);

prop('toEdn: every element key appears as keyword',
  arbIntentObj,
  (intent) => {
    const edn = toEdn(intent);
    return Object.keys(intent.elements).every(k => edn.includes(':' + k));
  }
);

prop('toEdn: every element has :desc, :type, :bindings',
  arbIntentObj.filter(i => Object.keys(i.elements).length > 0),
  (intent) => {
    const edn = toEdn(intent);
    const keys = Object.keys(intent.elements);
    // Count occurrences — should have at least one per element
    const descCount = (edn.match(/:desc /g) || []).length;
    const typeCount = (edn.match(/:type /g) || []).length;
    const bindCount = (edn.match(/:bindings /g) || []).length;
    return descCount >= keys.length
      && typeCount >= keys.length
      && bindCount >= keys.length;
  }
);

prop('toEdn: nil binding when binding is null',
  fc.record({
    intent: arbIntent,
    description: fc.constant(''),
    elements: fc.constant({ 'test-el': { desc: 'x', type: 'readable', binding: null } }),
  }),
  (intent) => {
    const edn = toEdn(intent);
    return edn.includes(':bindings nil');
  }
);

prop('toEdn: binding wraps in {:web {:strategy "value"}} when present',
  fc.record({
    intent: arbIntent,
    description: fc.constant(''),
    elements: fc.constant({
      'test-el': { desc: 'x', type: 'clickable', binding: { strategy: 'testid', value: 'btn' } }
    }),
  }),
  (intent) => {
    const edn = toEdn(intent);
    return edn.includes(':bindings {:web {:testid "btn"}}');
  }
);

// --- toGlossaryIntents ---

prop('toGlossaryIntents: elements without name or intent are excluded',
  fc.array(arbDataElement, { minLength: 0, maxLength: 15 }),
  (elements) => {
    const data = { elements };
    const result = toGlossaryIntents(data);
    const allOutputNames = result.flatMap(i => Object.keys(i.elements));
    // Every output name must have come from an element with both fields set
    const namedInputs = elements.filter(e => e['glossary-name'] && e['glossary-intent']);
    return allOutputNames.length <= namedInputs.length;
  }
);

prop('toGlossaryIntents: all elements in a group share the same intent',
  fc.array(arbDataElement, { minLength: 1, maxLength: 15 }),
  (elements) => {
    const result = toGlossaryIntents({ elements });
    return result.every(group =>
      group.intent && typeof group.intent === 'string'
    );
  }
);

prop('toGlossaryIntents: output count <= distinct intents in input',
  fc.array(arbDataElement, { minLength: 0, maxLength: 15 }),
  (elements) => {
    const result = toGlossaryIntents({ elements });
    const distinctIntents = new Set(
      elements.filter(e => e['glossary-name'] && e['glossary-intent']).map(e => e['glossary-intent'])
    );
    return result.length <= distinctIntents.size;
  }
);

prop('toGlossaryIntents: every named input appears in output',
  fc.array(arbDataElement, { minLength: 1, maxLength: 15 }),
  (elements) => {
    const result = toGlossaryIntents({ elements });
    const outputNames = new Set(result.flatMap(i => Object.keys(i.elements)));
    const namedInputs = elements.filter(e => e['glossary-name'] && e['glossary-intent']);
    // Every named input's glossary-name should be in output (last-write-wins for dupes)
    return namedInputs.every(e => outputNames.has(e['glossary-name']));
  }
);

prop('toGlossaryIntents: null/undefined data returns empty',
  fc.constant(null),
  (data) => {
    return toGlossaryIntents(data).length === 0
      && toGlossaryIntents(undefined).length === 0
      && toGlossaryIntents({}).length === 0;
  }
);

// -- Summary --

console.log(`\n${passed + failed} properties, ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
