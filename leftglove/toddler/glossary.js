// Pure functions for glossary EDN export (07k).
// Loaded by index.html via <script> and by Node tests via require().

(function (exports) {
  'use strict';

  function isDynamicId(id) {
    if (!id || typeof id !== 'string') return false;
    if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return true;
    if (/^\d+$/.test(id)) return true;
    if (/^[0-9a-f]{9,}$/i.test(id)) return true;
    if (/^(ember|react|__next|:r\d|ng-|mat-|cdk-|mui-)/i.test(id)) return true;
    if (/-\d{4,}$/.test(id)) return true;
    return false;
  }

  function bestLocator(locators) {
    if (!locators) return null;
    if (locators.testid) return { strategy: 'testid', value: locators.testid };
    if (locators.id && !isDynamicId(locators.id)) return { strategy: 'id', value: locators.id };
    if (locators.name) return { strategy: 'name', value: locators.name };
    if (locators.href) return { strategy: 'css', value: '[href="' + locators.href.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]' };
    return null;
  }

  function toGlossaryIntents(data) {
    if (!data || !data.elements) return [];
    var groups = {};
    data.elements.forEach(function (el) {
      var name = el['glossary-name'];
      var intent = el['glossary-intent'];
      if (!name || !intent) return;
      if (!groups[intent]) groups[intent] = { intent: intent, description: '', elements: {} };
      var loc = bestLocator(el.locators);
      groups[intent].elements[name] = {
        desc: el.label || '',
        type: (el.category || '').replace(/^:/, ''),
        binding: loc,
      };
    });
    return Object.values(groups);
  }

  function ednStr(s) {
    return '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function toEdn(intentObj) {
    var lines = [];
    lines.push(';; Intent region: ' + intentObj.intent);
    lines.push('');
    lines.push('{:intent ' + ednStr(intentObj.intent));
    lines.push(' :description ' + ednStr(intentObj.description));
    lines.push(' :elements');

    var keys = Object.keys(intentObj.elements);
    if (keys.length === 0) {
      lines.push(' {}}');
      return lines.join('\n');
    }

    var maxKeyLen = Math.max.apply(null, keys.map(function (k) { return k.length; }));

    keys.forEach(function (key, idx) {
      var el = intentObj.elements[key];
      var pad = new Array(maxKeyLen - key.length + 1).join(' ');
      var prefix = idx === 0 ? ' {:' : '  :';
      var suffix = idx === keys.length - 1 ? '}}' : '';

      var bindingStr = 'nil';
      if (el.binding) {
        bindingStr = '{:web {:' + el.binding.strategy + ' ' + ednStr(el.binding.value) + '}}';
      }

      lines.push(prefix + key + pad + ' {:desc ' + ednStr(el.desc));
      lines.push(new Array(prefix.length + key.length + pad.length + 2).join(' ')
        + ':type :' + (el.type || 'readable'));
      lines.push(new Array(prefix.length + key.length + pad.length + 2).join(' ')
        + ':bindings ' + bindingStr + '}' + suffix);
    });

    return lines.join('\n');
  }

  exports.ednStr = ednStr;
  exports.isDynamicId = isDynamicId;
  exports.bestLocator = bestLocator;
  exports.toGlossaryIntents = toGlossaryIntents;
  exports.toEdn = toEdn;

})(typeof module !== 'undefined' && module.exports ? module.exports : window);
