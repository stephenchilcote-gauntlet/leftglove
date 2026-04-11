// Pure functions for intermediate format serialization/parsing (07k).
// Loaded by index.html via <script> and by Node tests via require().

(function (exports) {
  'use strict';

  function validateIntermediate(data) {
    var errors = [];
    if (!data || typeof data !== 'object') { return ['Data must be an object']; }
    if (data['sieve-version'] !== '1.0') errors.push('Missing or unsupported sieve-version (expected "1.0")');
    if (!data.source || typeof data.source !== 'object') {
      errors.push('Missing source object');
    } else {
      if (!data.source.url) errors.push('Missing source.url');
      if (!data.source.viewport || typeof data.source.viewport.w !== 'number' || typeof data.source.viewport.h !== 'number') {
        errors.push('Missing or invalid source.viewport (need w and h as numbers)');
      }
      if (!data.source.timestamp) errors.push('Missing source.timestamp');
    }
    if (!Array.isArray(data.elements)) {
      errors.push('Missing or invalid elements array');
    } else {
      data.elements.forEach(function (el, i) {
        if (!el['sieve-id']) errors.push('Element ' + i + ': missing sieve-id');
        if (!el.category) errors.push('Element ' + i + ': missing category');
        if (!el['category-source']) errors.push('Element ' + i + ': missing category-source');
        if (!el.rect || typeof el.rect.x !== 'number' || typeof el.rect.y !== 'number'
            || typeof el.rect.w !== 'number' || typeof el.rect.h !== 'number')
          errors.push('Element ' + i + ': missing or invalid rect (need x, y, w, h)');
      });
    }
    if (!data.metadata || typeof data.metadata !== 'object') errors.push('Missing metadata object');
    if (typeof data['pass-1-complete'] !== 'boolean') errors.push('Missing pass-1-complete flag');
    return errors;
  }

  // Serialize app state to intermediate format.
  // st: { inventory, classifications, glossaryNames, pageUrl, screenshotUrl, screenshotDims }
  function toIntermediate(st) {
    var inv = st.inventory;
    if (!inv || !inv.elements) return null;

    var elements = inv.elements.map(function (el, i) {
      var cat = String(el.category || '').replace(/^:/, '');
      var classification = st.classifications[i] || null;
      var rect = el.rect || {};
      var g = st.glossaryNames[i] || {};
      return {
        'sieve-id': 'el-' + String(i + 1).padStart(3, '0'),
        'category': classification || cat,
        'category-source': classification ? 'human' : 'sieve',
        'tag': el.tag || null,
        'element-type': el['element-type'] || null,
        'label': el.label || null,
        'locators': el.locators || {},
        'state': el.state || { 'visible': true, 'disabled': false },
        'rect': { 'x': rect.x, 'y': rect.y, 'w': rect.w, 'h': rect.h },
        'visible-text': el.visibleText || null,
        'region': el.region || null,
        'form': el.form || null,
        'aria-role': el['aria-role'] || null,
        'glossary-name': g.name || null,
        'glossary-intent': g.intent || null,
        'glossary-source': g.source || null,
        'notes': g.notes || null,
      };
    });

    var vp = inv.viewport || st.screenshotDims;
    return {
      'sieve-version': '1.0',
      'source': {
        'url': st.pageUrl,
        'viewport': { 'w': vp.w, 'h': vp.h },
        'timestamp': new Date().toISOString(),
        'screenshot': st.screenshotUrl || null,
      },
      'elements': elements,
      'metadata': {
        'cookies': inv.cookies || [],
        'storage': {
          'localStorage': (inv.storage && inv.storage.localStorage) || [],
          'sessionStorage': (inv.storage && inv.storage.sessionStorage) || [],
        },
        'tabs': inv.tabs || 1,
      },
      'pass-1-complete': inv.elements.every(function (_, i) { return i in st.classifications; }),
      'pass-2-progress': Object.keys(st.glossaryNames).length,
    };
  }

  // Parse intermediate format into state fields (pure — no side effects).
  // Returns { inventory, classifications, glossaryNames, pageUrl, screenshotUrl }
  // or { errors: [...] } on validation failure.
  function parseIntermediate(data) {
    var errors = validateIntermediate(data);
    if (errors.length) return { errors: errors };

    var elements = [];
    var classifications = {};
    var glossaryNames = {};
    data.elements.forEach(function (el, i) {
      elements.push({
        tag: el.tag,
        'element-type': el['element-type'],
        label: el.label,
        category: ':' + String(el.category || '').replace(/^:/, ''),
        locators: el.locators,
        state: el.state,
        visibleText: el['visible-text'] || null,
        rect: el.rect,
        region: el.region,
        form: el.form,
        'aria-role': el['aria-role'],
      });
      if (el['category-source'] === 'human') {
        classifications[i] = el.category;
      }
      if (el['glossary-name'] && el['glossary-source'] === 'human') {
        glossaryNames[i] = {
          name: el['glossary-name'],
          intent: el['glossary-intent'] || '',
          source: el['glossary-source'],
          notes: el['notes'] || '',
        };
      }
    });

    var inventory = {
      url: { raw: data.source.url },
      viewport: data.source.viewport,
      cookies: data.metadata.cookies,
      storage: data.metadata.storage,
      tabs: data.metadata.tabs,
      elements: elements,
    };

    return {
      inventory: inventory,
      classifications: classifications,
      glossaryNames: glossaryNames,
      pageUrl: data.source.url,
      screenshotUrl: data.source.screenshot || null,
    };
  }

  exports.validateIntermediate = validateIntermediate;
  exports.toIntermediate = toIntermediate;
  exports.parseIntermediate = parseIntermediate;

})(typeof module !== 'undefined' && module.exports ? module.exports : window);
