(function sieve() {
  "use strict";

  // =========================================================================
  // Configuration
  // =========================================================================

  var CLICKABLE_TAGS = ["button", "summary"];
  var TYPABLE_TYPES = [
    "text", "email", "password", "search", "tel", "url", "number", "date",
    "datetime-local", "month", "week", "time"
  ];
  var LANDMARK_TAGS = ["nav", "main", "footer", "aside", "header", "section", "article"];
  var CHROME_ROLES = ["navigation", "banner", "contentinfo", "complementary", "main", "region"];
  var CLICKABLE_ROLES = ["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "option", "gridcell"];
  var TYPABLE_ROLES = ["textbox", "searchbox", "spinbutton"];
  var READABLE_ROLES = ["heading", "alert", "status", "log", "marquee", "timer"];
  var CUSTOM_TAGS = ["canvas", "video", "audio", "svg"];
  var MIN_DIMENSION = 2; // elements smaller than this in both dimensions are filtered

  // =========================================================================
  // Helpers
  // =========================================================================

  function isVisible(el) {
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
      return false;
    }
    var style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function hasContent(el) {
    // Does this element have meaningful text or child elements?
    var text = (el.textContent || "").trim();
    if (text.length > 0) return true;
    if (el.querySelector("img, svg, canvas, video, input, button, a")) return true;
    return false;
  }

  function getAbsoluteRect(el) {
    var r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height)
    };
  }

  function resolveLabel(el) {
    // Label resolution chain per sieve contract
    var label;

    // 1. aria-label
    label = el.getAttribute("aria-label");
    if (label && label.trim()) return label.trim();

    // 2. aria-labelledby
    var labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      var parts = labelledBy.split(/\s+/).map(function(id) {
        var ref = document.getElementById(id);
        return ref ? (ref.textContent || "").trim() : "";
      }).filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }

    // 3. Associated <label> element (for inputs)
    if (el.id) {
      var assocLabel = document.querySelector('label[for="' + el.id + '"]');
      if (assocLabel) {
        label = (assocLabel.textContent || "").trim();
        if (label) return label;
      }
    }
    // Also check wrapping label
    var parentLabel = el.closest("label");
    if (parentLabel) {
      label = (parentLabel.textContent || "").trim();
      if (label) return label;
    }

    // 4. title
    label = el.getAttribute("title");
    if (label && label.trim()) return label.trim();

    // 5. placeholder (for inputs)
    label = el.getAttribute("placeholder");
    if (label && label.trim()) return label.trim();

    // 6. innerText (for buttons, links — trimmed, collapsed whitespace)
    label = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (label && label.length > 0 && label.length < 200) return label;

    // 7. alt (for images)
    label = el.getAttribute("alt");
    if (label && label.trim()) return label.trim();

    return null;
  }

  function collectLocators(el) {
    var locators = {};
    if (el.id) locators.id = el.id;
    if (el.name) locators.name = el.name;
    var testid = el.getAttribute("data-testid") || el.getAttribute("data-cy") || el.getAttribute("data-test");
    if (testid) locators.testid = testid;
    if (el.tagName === "A" && el.getAttribute("href")) locators.href = el.getAttribute("href");
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) locators["aria-label"] = ariaLabel;
    // Collect classes as last resort (only if nothing else)
    if (Object.keys(locators).length === 0 && el.className && typeof el.className === "string") {
      var classes = el.className.trim();
      if (classes) locators["css-class"] = classes;
    }
    return locators;
  }

  function deriveRegion(el) {
    // Walk up DOM collecting landmark ancestors
    var parts = [];
    var current = el.parentElement;
    while (current && current !== document.body) {
      var tag = current.tagName.toLowerCase();
      var role = current.getAttribute("role");

      if (LANDMARK_TAGS.indexOf(tag) !== -1 || (role && CHROME_ROLES.indexOf(role) !== -1)) {
        // Use aria-label, id, or tag as the region name
        var name = current.getAttribute("aria-label")
                || current.id
                || role
                || tag;
        parts.unshift(name);
      } else if (tag === "form") {
        var formName = current.getAttribute("aria-label") || current.id || "form";
        parts.unshift(formName);
      }

      current = current.parentElement;
    }
    return parts.length > 0 ? parts.join(" > ") : null;
  }

  function getElementState(el) {
    var state = {};
    state.visible = true; // we already filtered invisible
    if (el.disabled !== undefined) state.disabled = !!el.disabled;
    if (el.checked !== undefined) state.checked = !!el.checked;
    if (el.getAttribute("aria-expanded") !== null) {
      state.expanded = el.getAttribute("aria-expanded") === "true";
    }
    if (el.getAttribute("aria-selected") !== null) {
      state.selected = el.getAttribute("aria-selected") === "true";
    }
    return state;
  }

  // =========================================================================
  // Classification
  // =========================================================================

  function classify(el) {
    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute("role");
    var type = (el.getAttribute("type") || "").toLowerCase();
    var result = { category: null, confidence: null, roles: [], elementType: null };

    // --- Custom (canvas, video, audio, svg) ---
    if (CUSTOM_TAGS.indexOf(tag) !== -1) {
      result.category = "custom";
      result.confidence = "certain";
      result.elementType = tag;
      result.roles.push("custom");
      return result;
    }

    // --- Typable ---
    if (tag === "textarea" || el.getAttribute("contenteditable") === "true") {
      result.category = "typable";
      result.confidence = "certain";
      result.elementType = tag === "textarea" ? "textarea" : "contenteditable";
      result.roles.push("typable");
      return result;
    }
    if (tag === "input" && TYPABLE_TYPES.indexOf(type) !== -1) {
      result.category = "typable";
      result.confidence = "certain";
      result.elementType = type;
      result.roles.push("typable");
      return result;
    }
    if (role && TYPABLE_ROLES.indexOf(role) !== -1) {
      result.category = "typable";
      result.confidence = "high";
      result.elementType = role;
      result.roles.push("typable");
      return result;
    }

    // --- Selectable ---
    if (tag === "select") {
      result.category = "selectable";
      result.confidence = "certain";
      result.elementType = el.multiple ? "multi-select" : "select";
      result.roles.push("selectable");
      return result;
    }
    if (role === "listbox" || role === "combobox") {
      result.category = "selectable";
      result.confidence = "high";
      result.elementType = role;
      result.roles.push("selectable");
      return result;
    }

    // --- Clickable ---
    if (CLICKABLE_TAGS.indexOf(tag) !== -1) {
      result.category = "clickable";
      result.confidence = "certain";
      result.elementType = type || tag;
      result.roles.push("clickable");
      // Check for dual-role (e.g., button containing an image)
      if (el.querySelector("img")) result.roles.push("image");
      return result;
    }
    if (tag === "a" && el.hasAttribute("href")) {
      result.category = "clickable";
      result.confidence = "certain";
      result.elementType = "link";
      result.roles.push("clickable");
      if (el.querySelector("img")) result.roles.push("image");
      return result;
    }
    if (tag === "input" && (type === "submit" || type === "button" || type === "reset")) {
      result.category = "clickable";
      result.confidence = "certain";
      result.elementType = type;
      result.roles.push("clickable");
      return result;
    }
    if (tag === "input" && (type === "checkbox" || type === "radio")) {
      result.category = "clickable";
      result.confidence = "certain";
      result.elementType = type;
      result.roles.push("clickable");
      return result;
    }
    if (role && CLICKABLE_ROLES.indexOf(role) !== -1) {
      result.category = "clickable";
      result.confidence = "high";
      result.elementType = role;
      result.roles.push("clickable");
      return result;
    }
    // Inferred clickable: has onclick or tabindex
    if (el.hasAttribute("onclick") || el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") {
      result.category = "clickable";
      result.confidence = "inferred";
      result.elementType = null;
      result.roles.push("clickable");
      return result;
    }

    // --- Chrome (landmarks) ---
    if (LANDMARK_TAGS.indexOf(tag) !== -1) {
      result.category = "chrome";
      result.confidence = "certain";
      result.elementType = null;
      result.roles.push("chrome");
      return result;
    }
    if (role && CHROME_ROLES.indexOf(role) !== -1) {
      result.category = "chrome";
      result.confidence = "high";
      result.elementType = null;
      result.roles.push("chrome");
      return result;
    }

    // --- Readable ---
    // Headings
    if (/^h[1-6]$/.test(tag)) {
      result.category = "readable";
      result.confidence = "certain";
      result.elementType = "heading";
      result.roles.push("readable");
      return result;
    }
    if (role && READABLE_ROLES.indexOf(role) !== -1) {
      result.category = "readable";
      result.confidence = "high";
      result.elementType = role;
      result.roles.push("readable");
      return result;
    }
    // Paragraphs and text containers with actual visible text
    if ((tag === "p" || tag === "span" || tag === "li" || tag === "td" || tag === "th" ||
         tag === "blockquote" || tag === "figcaption" || tag === "small" || tag === "label") &&
        hasContent(el)) {
      var text = (el.innerText || "").trim();
      if (text.length > 0) {
        result.category = "readable";
        result.confidence = "certain";
        result.elementType = "text";
        result.roles.push("readable");
        return result;
      }
    }
    // img with alt
    if (tag === "img") {
      var alt = el.getAttribute("alt");
      // Decorative images (empty alt) are chrome/noise
      if (alt === "" || alt === null) {
        return null; // filter out
      }
      result.category = "readable";
      result.confidence = "certain";
      result.elementType = "image";
      result.roles.push("readable");
      result.roles.push("image");
      return result;
    }

    // --- Unclassified: filter out ---
    return null;
  }

  // =========================================================================
  // URL decomposition
  // =========================================================================

  function decomposeUrl() {
    var u = window.location;
    var params = {};
    var searchParams = new URLSearchParams(u.search);
    searchParams.forEach(function(value, key) {
      params[key] = value;
    });
    return {
      raw: u.href,
      origin: u.origin,
      protocol: u.protocol.replace(":", ""),
      hostname: u.hostname,
      port: u.port || null,
      pathname: u.pathname,
      search: u.search || null,
      params: params,
      hash: u.hash ? u.hash.replace("#", "") : null
    };
  }

  // =========================================================================
  // Main sieve function
  // =========================================================================

  function runSieve() {
    var elements = [];
    var forms = [];
    var iframes = [];

    // Collect form info
    var formEls = document.querySelectorAll("form");
    for (var f = 0; f < formEls.length; f++) {
      var form = formEls[f];
      var formId = form.id || form.getAttribute("aria-label") || ("form-" + f);
      var formInputIds = [];
      var inputs = form.querySelectorAll("input, select, textarea, button");
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].id) formInputIds.push(inputs[i].id);
      }
      forms.push({ id: formId, elementRefs: formInputIds });
    }

    // Collect iframe info
    var iframeEls = document.querySelectorAll("iframe");
    for (var fi = 0; fi < iframeEls.length; fi++) {
      var iframe = iframeEls[fi];
      var sameOrigin = false;
      var childCount = null;
      try {
        var doc = iframe.contentDocument;
        if (doc) {
          sameOrigin = true;
          childCount = doc.querySelectorAll("*").length;
        }
      } catch (e) {
        sameOrigin = false;
      }
      iframes.push({
        src: iframe.src || null,
        sameOrigin: sameOrigin,
        elementCount: childCount,
        rect: getAbsoluteRect(iframe)
      });
    }

    // Walk all elements
    var allElements = document.querySelectorAll("*");
    for (var idx = 0; idx < allElements.length; idx++) {
      var el = allElements[idx];
      var tag = el.tagName.toLowerCase();

      // Skip script, style, meta, noscript, template, br, hr
      if (["script", "style", "meta", "link", "noscript", "template", "br", "hr", "head"].indexOf(tag) !== -1) {
        continue;
      }

      // Skip invisible elements
      if (!isVisible(el)) continue;

      // Classify
      var classification = classify(el);
      if (classification === null) continue;

      // Skip elements with zero/tiny dimensions (unless they're landmarks)
      var rect = getAbsoluteRect(el);
      if (rect.w < MIN_DIMENSION && rect.h < MIN_DIMENSION && classification.category !== "chrome") {
        continue;
      }

      // Skip readable elements that are children of interactive elements
      if (classification.category === "readable") {
        var interactiveParent = el.closest("button, a, input, select, textarea, [role=button], [role=link]");
        if (interactiveParent && interactiveParent !== el) continue;

        // Skip readable children of other readable elements (e.g., <small> inside <p>)
        var readableParent = el.parentElement ? el.parentElement.closest("p, li, td, th, blockquote, figcaption, h1, h2, h3, h4, h5, h6") : null;
        if (readableParent && readableParent !== el) continue;

        // Skip readable elements that are just wrappers for a single interactive child
        // (e.g., <li><a>Terms</a></li> — the <a> carries the interaction, <li> is noise)
        var interactiveChild = el.querySelector("a, button, input, select, textarea, [role=button], [role=link]");
        if (interactiveChild) {
          var elText = (el.innerText || "").trim();
          var childText = (interactiveChild.innerText || "").trim();
          if (elText === childText) continue;
        }

        // Skip readable elements inside chrome landmarks when the landmark already
        // carries the same text as its label (e.g., <p> inside <footer>)
        var landmarkParent = el.closest("nav, main, footer, aside, header, [role=navigation], [role=banner], [role=contentinfo], [role=complementary]");
        if (landmarkParent && landmarkParent !== el) {
          var landmarkTag = landmarkParent.tagName.toLowerCase();
          if (landmarkTag !== "main") {
            // Non-main chrome: skip readable children whose text is redundant
            // with the landmark's own label
            var elText = (el.innerText || "").trim();
            var landmarkLabel = landmarkParent.getAttribute("aria-label")
                             || (landmarkParent.innerText || "").trim();
            if (elText && elText === landmarkLabel) continue;
          }
        }
      }

      // Skip labels that are associated with an input (they're consumed by the input's label resolution)
      if (tag === "label" && el.getAttribute("for")) {
        var target = document.getElementById(el.getAttribute("for"));
        if (target) continue;
      }

      // Build element record
      var record = {
        category: classification.category,
        roles: classification.roles,
        confidence: classification.confidence,
        tag: tag,
        elementType: classification.elementType,
        label: resolveLabel(el),
        locators: collectLocators(el),
        state: getElementState(el),
        rect: rect,
        region: deriveRegion(el),
        form: null,
        ariaRole: el.getAttribute("role") || null
      };

      // Associate with form if inside one
      var parentForm = el.closest("form");
      if (parentForm) {
        // Match the same ID logic used in the forms collection above
        var formIndex = Array.prototype.indexOf.call(formEls, parentForm);
        record.form = parentForm.id || parentForm.getAttribute("aria-label")
                   || (formIndex !== -1 ? "form-" + formIndex : "form");
      }

      elements.push(record);
    }

    // Build region tree from chrome elements
    var regions = {};
    for (var ri = 0; ri < elements.length; ri++) {
      if (elements[ri].category === "chrome" && elements[ri].region === null) {
        // Top-level landmark — use aria-label or tag, not innerText
        var name = elements[ri].locators["aria-label"]
                || elements[ri].ariaRole
                || elements[ri].tag;
        regions[name] = {};
      }
    }

    // Return the page inventory
    return {
      url: decomposeUrl(),
      title: document.title,
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight
      },
      window: {
        w: window.outerWidth,
        h: window.outerHeight
      },
      elements: elements,
      forms: forms,
      regions: regions,
      iframes: iframes,
      meta: {
        description: (document.querySelector('meta[name="description"]') || {}).content || null,
        ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content || null,
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null
      },
      console: [], // populated externally if needed
      timestamp: new Date().toISOString()
    };
  }

  return runSieve();
})();
