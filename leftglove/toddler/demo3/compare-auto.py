#!/usr/bin/env python3
"""
Compare auto-classify results against manually curated ground truth.

Navigates to each demo3 URL, runs sieve + auto-classify, then compares
against the curated labels from curate-labels.py.

Requires: sieve server on :3333, toddler server on :8080
"""
import json
import sys
import time
import urllib.request

SIEVE = "http://localhost:3333"
TL = "http://localhost:8080"

# Ground truth from curate-labels.py: {sieve_key: {element_index: "name"}}
# Also need the curate-sieves.py keep-sets for chrome/non-chrome ground truth.
# We import them by extracting from the curated workflow-sieves.json.

DIRECT_PAGES = [
    ("ebay-search",    "https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds"),
    ("ebay-product-1", "https://www.ebay.com/itm/358414472620"),
    ("ebay-product-2", "https://www.ebay.com/itm/334666199288"),
    ("ebay-product-3", "https://www.ebay.com/itm/317739753035"),
    ("rc-home",        "https://www.reservecalifornia.com/"),
]

# Ground truth names from curate-labels.py (just the names, not indices,
# since live page indices will differ)
GROUND_TRUTH_NAMES = {
    "ebay-search": [
        "search-input", "category", "search",
        "filter-free-shipping", "filter-price-under-13", "filter-price-13-to-25",
        "filter-price-over-25", "price-min", "price-max", "price-apply",
        "condition-new", "condition-used",
        "format-auction", "format-buy-now", "format-offers",
        "result-count", "save-search",
        "tab-all", "tab-auction", "tab-buy-now", "tab-condition",
        "tab-location", "tab-sort",
        "product-bandido", "product-jlab", "product-ai-earbuds", "product-beats",
    ],
    "ebay-product-1": [
        "product-title", "seller", "review-count", "seller-rating",
        "price", "condition", "buy-now", "add-to-cart",
        "shipping", "returns-policy",
    ],
    "ebay-product-2": [
        "product-title", "seller", "review-count", "seller-rating",
        "price", "condition", "buy-now", "add-to-cart",
        "shipping", "returns-policy",
    ],
    "ebay-product-3": [
        "product-title", "seller", "review-count", "seller-rating",
        "price", "was-price", "condition", "buy-now", "add-to-cart",
        "shipping", "returns-policy",
    ],
    "rc-home": [
        "park-search",
    ],
}

# Ground truth non-chrome counts (from curate-sieves.py keep-sets)
GROUND_TRUTH_NONCHROME = {
    "ebay-search": 27,
    "ebay-product-1": 10,
    "ebay-product-2": 10,
    "ebay-product-3": 11,
    "rc-home": 1,
}


def api(method, url, data=None, timeout=120):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    if body:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def navigate(url):
    return api("POST", f"{SIEVE}/navigate", {"url": url})


def sieve():
    return api("POST", f"{SIEVE}/sieve")


def screenshot_b64():
    req = urllib.request.Request(f"{SIEVE}/screenshot")
    with urllib.request.urlopen(req, timeout=15) as resp:
        import base64
        return base64.b64encode(resp.read()).decode()


def element_screenshots(indices):
    return api("POST", f"{SIEVE}/element-screenshots", {"indices": indices})


def auto_analyze(ss_b64, page_url):
    return api("POST", f"{TL}/auto-analyze", {
        "screenshotB64": ss_b64,
        "pageUrl": page_url,
    })


def auto_classify(full_ss_b64, analysis_text, elements, page_url, claimed_names=None):
    return api("POST", f"{TL}/auto-classify", {
        "fullScreenshotB64": full_ss_b64,
        "analysisText": analysis_text,
        "elements": elements,
        "pageUrl": page_url,
        "claimedNames": claimed_names or [],
    })


def run_page(label, url):
    print(f"\n{'='*70}")
    print(f"  {label}: {url}")
    print(f"{'='*70}")

    # Navigate
    nav = navigate(url)
    print(f"  Navigated: {nav.get('title', '?')}")
    time.sleep(2)  # let page settle

    # Sieve
    inv = sieve()
    elements = inv.get("elements", [])
    print(f"  Sieved: {len(elements)} elements")

    # Screenshot
    ss = screenshot_b64()

    # Element screenshots for all elements
    all_indices = list(range(len(elements)))
    BATCH = 50
    ss_map = {}
    for i in range(0, len(all_indices), BATCH):
        batch = all_indices[i:i+BATCH]
        result = element_screenshots(batch)
        for s in result.get("screenshots", []):
            if s["b64"]:
                ss_map[s["index"]] = s["b64"]
    print(f"  Element screenshots: {len(ss_map)}")

    # Phase 1: analyze
    analysis = auto_analyze(ss, url)
    analysis_text = analysis["analysis"]
    print(f"  Analysis: {analysis_text[:100]}...")

    # Phase 2: classify in batches, threading claimed handles across batches
    CLASSIFY_BATCH = 15
    all_classifications = []
    claimed_names = []
    for i in range(0, len(elements), CLASSIFY_BATCH):
        batch_indices = list(range(i, min(i + CLASSIFY_BATCH, len(elements))))
        batch_elements = []
        for idx in batch_indices:
            el = elements[idx]
            batch_elements.append({
                "index": idx,
                "tag": el.get("tag", ""),
                "elementType": el.get("elementType", None),
                "label": el.get("label", None),
                "visibleText": (el.get("label") or "")[:80],  # sieve uses label
                "ariaRole": el.get("ariaRole", None),
                "locators": el.get("locators", None),
                "screenshotB64": ss_map.get(idx),
            })
        result = auto_classify(ss, analysis_text, batch_elements, url, claimed_names)
        batch_results = result.get("classifications", [])
        all_classifications.extend(batch_results)
        for c in batch_results:
            nm = c.get("name")
            cat = c.get("category")
            if nm and cat not in ("chrome", "skip") and nm not in claimed_names:
                claimed_names.append(nm)
        sys.stdout.write(f"\r  Classifying... {min(i + CLASSIFY_BATCH, len(elements))}/{len(elements)}  claimed={len(claimed_names)}")
        sys.stdout.flush()
    print()

    # Tally results. First-write-wins dedup by name: if the model re-uses a handle
    # across batches, only the earliest match keeps the name; the rest become chrome.
    cats = {}
    named = {}
    used_names = set()
    for c in all_classifications:
        cat = c.get("category", "?")
        name = c.get("name")
        if name and cat not in ("chrome", "skip"):
            if name in used_names or name == "chrome":
                cat = "chrome"
                name = None
            else:
                used_names.add(name)
                named[c["index"]] = name
        cats[cat] = cats.get(cat, 0) + 1

    non_chrome = len(elements) - cats.get("chrome", 0) - cats.get("skip", 0)

    print(f"\n  Results:")
    print(f"    Total elements: {len(elements)}")
    print(f"    Categories: {cats}")
    print(f"    Non-chrome: {non_chrome}")
    print(f"    Named: {len(named)}")

    # Compare against ground truth
    gt_names = GROUND_TRUTH_NAMES.get(label, [])
    gt_nonchrome = GROUND_TRUTH_NONCHROME.get(label)

    if gt_nonchrome is not None:
        print(f"\n  Ground truth non-chrome: {gt_nonchrome}")
        print(f"  Auto non-chrome:        {non_chrome}")
        ratio = non_chrome / gt_nonchrome if gt_nonchrome else float('inf')
        if ratio > 3:
            print(f"  ** AUTO IS {ratio:.1f}x MORE PERMISSIVE **")
        elif ratio < 0.5:
            print(f"  ** AUTO IS TOO AGGRESSIVE (only {ratio:.0%} of expected) **")

    if gt_names:
        print(f"\n  Ground truth names ({len(gt_names)}):")
        for n in gt_names:
            print(f"    - {n}")
        print(f"\n  Auto names ({len(named)}):")
        for idx in sorted(named.keys()):
            el = elements[idx]
            tag = el.get("tag", "?")
            lbl = (el.get("label") or "")[:40]
            print(f"    [{idx:3d}] {named[idx]:<30} <{tag}> {lbl}")

    return {
        "label": label,
        "total": len(elements),
        "cats": cats,
        "non_chrome": non_chrome,
        "named": named,
        "gt_names": gt_names,
        "gt_nonchrome": gt_nonchrome,
    }


def main():
    results = []
    for label, url in DIRECT_PAGES:
        try:
            r = run_page(label, url)
            results.append(r)
        except Exception as e:
            print(f"\n  FAILED: {e}")
            results.append({"label": label, "error": str(e)})

    # Summary table
    print(f"\n\n{'='*70}")
    print(f"  SUMMARY")
    print(f"{'='*70}")
    print(f"  {'Page':<20} {'Total':>6} {'Chrome':>7} {'Non-chr':>8} {'GT':>4} {'Named':>6} {'GT names':>9}")
    print(f"  {'-'*20} {'-'*6} {'-'*7} {'-'*8} {'-'*4} {'-'*6} {'-'*9}")
    for r in results:
        if "error" in r:
            print(f"  {r['label']:<20} ERROR: {r['error'][:40]}")
            continue
        gt = r.get("gt_nonchrome", "?")
        gt_n = len(r.get("gt_names", []))
        chrome = r["cats"].get("chrome", 0) + r["cats"].get("skip", 0)
        print(f"  {r['label']:<20} {r['total']:>6} {chrome:>7} {r['non_chrome']:>8} {gt:>4} {len(r['named']):>6} {gt_n:>9}")


if __name__ == "__main__":
    main()
