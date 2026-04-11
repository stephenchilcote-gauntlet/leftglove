// Pure element-matching and diff functions (extracted from app.js).
// Loaded by index.html via <script> and by Node tests via require().
// Depends on isDynamicId from glossary.js (loaded first in browser).

(function (exports) {
  'use strict';

  // Resolve isDynamicId: browser global or require'd glossary
  var _isDynamicId = (typeof isDynamicId === 'function')
    ? isDynamicId
    : (typeof require === 'function' ? require('./glossary').isDynamicId : null);

  function elementKey(el) {
    if (el.locators?.testid) return 'testid::' + el.locators.testid;
    if (el.locators?.id && _isDynamicId && !_isDynamicId(el.locators.id)) return 'id::' + el.locators.id;
    if (el.locators?.name) return 'name::' + el.locators.name;
    return 'composite::' + (el.region || '') + '::' + (el.tag || '') + '::' + (el.label || '');
  }

  function matchElements(oldEls, newEls) {
    var oldByKey = {};
    var newByKey = {};

    for (var i = 0; i < oldEls.length; i++) {
      var k = elementKey(oldEls[i]);
      if (!oldByKey[k]) oldByKey[k] = [];
      oldByKey[k].push(i);
    }
    for (var j = 0; j < newEls.length; j++) {
      var k2 = elementKey(newEls[j]);
      if (!newByKey[k2]) newByKey[k2] = [];
      newByKey[k2].push(j);
    }

    var matched = [];
    var added = [];
    var removed = [];
    var ambiguous = [];

    var allKeys = {};
    for (var ok in oldByKey) allKeys[ok] = true;
    for (var nk in newByKey) allKeys[nk] = true;

    for (var key in allKeys) {
      var oldIdxs = oldByKey[key] || [];
      var newIdxs = newByKey[key] || [];

      if (oldIdxs.length === 1 && newIdxs.length === 1) {
        matched.push({ oldIdx: oldIdxs[0], newIdx: newIdxs[0], key: key });
      } else if (oldIdxs.length === 0) {
        for (var a = 0; a < newIdxs.length; a++) {
          added.push({ newIdx: newIdxs[a], key: key });
        }
      } else if (newIdxs.length === 0) {
        for (var r = 0; r < oldIdxs.length; r++) {
          removed.push({ oldIdx: oldIdxs[r], key: key });
        }
      } else {
        ambiguous.push({ key: key, oldIdxs: oldIdxs, newIdxs: newIdxs });
      }
    }

    return { matched: matched, added: added, removed: removed, ambiguous: ambiguous };
  }

  function propagateNames(matchResult, oldClassifications, oldGlossaryNames, resolvedPairs) {
    var cls = {};
    var names = {};
    var allPairs = matchResult.matched.concat(resolvedPairs || []);

    for (var i = 0; i < allPairs.length; i++) {
      var p = allPairs[i];
      if (oldClassifications[p.oldIdx] !== undefined) {
        cls[p.newIdx] = oldClassifications[p.oldIdx];
      }
      if (oldGlossaryNames[p.oldIdx] !== undefined) {
        names[p.newIdx] = oldGlossaryNames[p.oldIdx];
      }
    }

    return { classifications: cls, glossaryNames: names };
  }

  function computeDiff(oldEls, newEls, matchResult) {
    var added = [];
    var removed = [];
    var changed = [];
    var unchanged = [];

    for (var i = 0; i < matchResult.matched.length; i++) {
      var m = matchResult.matched[i];
      var oldEl = oldEls[m.oldIdx];
      var newEl = newEls[m.newIdx];
      var changes = [];

      if ((oldEl.label || '') !== (newEl.label || '')) {
        changes.push('label: \'' + (oldEl.label || '') + '\' \u2192 \'' + (newEl.label || '') + '\'');
      }
      if ((oldEl.tag || '') !== (newEl.tag || '')) {
        changes.push('tag: ' + (oldEl.tag || '') + ' \u2192 ' + (newEl.tag || ''));
      }
      if ((oldEl.region || '') !== (newEl.region || '')) {
        changes.push('region: ' + (oldEl.region || '') + ' \u2192 ' + (newEl.region || ''));
      }
      var oldBox = oldEl.rect;
      var newBox = newEl.rect;
      if (oldBox && newBox) {
        var dx = Math.abs((oldBox.x || 0) - (newBox.x || 0));
        var dy = Math.abs((oldBox.y || 0) - (newBox.y || 0));
        var dw = Math.abs((oldBox.w || 0) - (newBox.w || 0));
        var dh = Math.abs((oldBox.h || 0) - (newBox.h || 0));
        if (dx > 5 || dy > 5 || dw > 5 || dh > 5) {
          changes.push('moved/resized');
        }
      }
      if ((oldEl.visibleText || '') !== (newEl.visibleText || '')) {
        changes.push('text changed');
      }
      if (oldEl.state && newEl.state) {
        var stateChanges = [];
        for (var sk in newEl.state) {
          if (newEl.state[sk] !== oldEl.state[sk]) stateChanges.push(sk);
        }
        for (var sk2 in oldEl.state) {
          if (!(sk2 in newEl.state) && oldEl.state[sk2] !== undefined) stateChanges.push(sk2);
        }
        if (stateChanges.length) changes.push('state: ' + stateChanges.join(', '));
      }

      if (changes.length > 0) {
        changed.push({ oldIdx: m.oldIdx, newIdx: m.newIdx, key: m.key, oldEl: oldEl, newEl: newEl, changes: changes });
      } else {
        unchanged.push({ oldIdx: m.oldIdx, newIdx: m.newIdx, key: m.key });
      }
    }

    for (var a = 0; a < matchResult.added.length; a++) {
      var add = matchResult.added[a];
      added.push({ newIdx: add.newIdx, key: add.key, el: newEls[add.newIdx] });
    }

    for (var r = 0; r < matchResult.removed.length; r++) {
      var rem = matchResult.removed[r];
      removed.push({ oldIdx: rem.oldIdx, key: rem.key, el: oldEls[rem.oldIdx] });
    }

    return { added: added, removed: removed, changed: changed, unchanged: unchanged };
  }

  function classifyDiff(diff, urlA, urlB) {
    var addedCount = diff.added.length;
    var removedCount = diff.removed.length;
    var changedCount = diff.changed.length;

    if (addedCount === 0 && removedCount === 0 && changedCount === 0) return 'no-effect';

    var urlChanged = (urlA || '') !== (urlB || '');
    var totalOld = removedCount + changedCount + diff.unchanged.length;
    var totalNew = addedCount + changedCount + diff.unchanged.length;
    var maxTotal = Math.max(totalOld, totalNew, 1);

    if (urlChanged && (removedCount + addedCount) / maxTotal > 0.5) return 'navigation';
    if (addedCount > 0 && removedCount === 0 && changedCount === 0) return 'reveal';
    if (removedCount > 0 && addedCount === 0 && changedCount === 0) return 'conceal';
    if (changedCount > 0 && addedCount === 0 && removedCount === 0) return 'state-mutation';
    return 'compound';
  }

  exports.elementKey = elementKey;
  exports.matchElements = matchElements;
  exports.propagateNames = propagateNames;
  exports.computeDiff = computeDiff;
  exports.classifyDiff = classifyDiff;

})(typeof module !== 'undefined' && module.exports ? module.exports : window);
