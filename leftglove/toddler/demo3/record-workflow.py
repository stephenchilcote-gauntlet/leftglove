#!/usr/bin/env python3
"""Record real LeftGlove MCP workflows against eBay and ReserveCalifornia.

Drives the sieve server's HTTP API using ONLY the MCP tool interface:
  - observe(url?) → sieve inventory
  - click(index)  → click element by sieve index
  - fill(index, text) → fill element by sieve index

No CSS selectors. No coordinate hacks. This is exactly what an agent sees.

Produces:
  - screenshots/{step}_{label}.png  — browser state after each action
  - workflow-log.json               — timestamped trace of all calls
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

SIEVE = os.environ.get("SIEVE_URL", "http://localhost:3333")
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "screenshots")
os.makedirs(OUT, exist_ok=True)

log_entries = []
step_counter = 0
T0 = 0


def api(method, endpoint, body=None):
    url = f"{SIEVE}{endpoint}"
    if body is not None:
        data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data,
                                     headers={"Content-Type": "application/json"},
                                     method=method)
    else:
        req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            ct = resp.headers.get("Content-Type", "")
            return raw if "image" in ct else json.loads(raw)
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:300]
        print(f"  ⚠ HTTP {e.code} on {endpoint}: {err[:100]}")
        return {"error": err}


def screenshot(name):
    global step_counter
    raw = api("GET", "/screenshot")
    if isinstance(raw, dict):
        return None
    path = os.path.join(OUT, f"{step_counter:03d}_{name}.png")
    with open(path, "wb") as f:
        f.write(raw)
    print(f"  📸 {os.path.basename(path)} ({len(raw)//1024}KB)")
    return path


def log_step(tool, label, extra=None):
    global step_counter, T0
    step_counter += 1
    if T0 == 0:
        T0 = time.time()
    entry = {"step": step_counter, "tool": tool, "label": label,
             "t": round(time.time() - T0, 2)}
    if extra:
        entry.update(extra)
    return entry


def observe(url=None, label="observe", wait=1.0):
    """MCP observe tool."""
    entry = log_step("observe", label)
    if url:
        nav = api("POST", "/navigate", {"url": url})
        entry["navigate"] = {"url": url}
        title = nav.get("title", "")[:60] if isinstance(nav, dict) else ""
        short = url[:50] + "..." if len(url) > 50 else url
        print(f"[{step_counter}] observe({short})")
        time.sleep(wait)
    else:
        print(f"[{step_counter}] observe()")

    sieve_result = api("POST", "/sieve")
    if isinstance(sieve_result, dict) and "error" not in sieve_result:
        elements = sieve_result.get("elements", [])
        cats = {}
        for e in elements:
            cats[e.get("category", "?")] = cats.get(e.get("category", "?"), 0) + 1
        entry["sieve"] = {
            "element_count": len(elements),
            "categories": cats,
            "url": sieve_result.get("url", {}).get("raw", ""),
            "title": sieve_result.get("title", ""),
        }
        print(f"  → {len(elements)} elements")
    entry["screenshot"] = screenshot(label)
    entry["_sieve"] = sieve_result
    entry["end_t"] = round(time.time() - T0, 2)
    log_entries.append(entry)
    return sieve_result


def click(index, label="click", wait=0.5):
    """MCP click tool — by element index only."""
    entry = log_step("click", label, extra={"index": index})
    result = api("POST", "/click", {"index": index})
    ok = isinstance(result, dict) and "error" not in result
    print(f"[{step_counter}] click(index={index}) {'✓' if ok else '✗'}")
    if not ok:
        print(f"  error: {str(result.get('error',''))[:100]}")
    time.sleep(wait)
    entry["screenshot"] = screenshot(label)
    entry["end_t"] = round(time.time() - T0, 2)
    log_entries.append(entry)
    return result


def fill(index, text, label="fill", wait=0.5):
    """MCP fill tool — by element index only."""
    entry = log_step("fill", label, extra={"index": index, "text": text})
    result = api("POST", "/fill", {"index": index, "text": text})
    ok = isinstance(result, dict) and "error" not in result
    print(f"[{step_counter}] fill(index={index}, '{text}') {'✓' if ok else '✗'}")
    time.sleep(wait)
    entry["screenshot"] = screenshot(label)
    entry["end_t"] = round(time.time() - T0, 2)
    log_entries.append(entry)
    return result


def find_el(sieve, **kw):
    """Find first matching element. Returns (index, element) or (None, None)."""
    for i, e in enumerate(sieve.get("elements", [])):
        ok = True
        for k, v in kw.items():
            if k == "label_contains":
                if v.lower() not in (e.get("label") or "").lower():
                    ok = False
            elif k == "label_exact":
                if (e.get("label") or "").strip() != v:
                    ok = False
            elif k == "category":
                if e.get("category") != v:
                    ok = False
            elif k == "tag":
                if e.get("tag") != v:
                    ok = False
            elif k == "id":
                if e.get("locators", {}).get("id") != v:
                    ok = False
        if ok:
            return i, e
    return None, None


def wait_for_load(timeout=15, not_text="processing"):
    """Re-sieve until spinner text disappears."""
    deadline = time.time() + timeout
    sieve = None
    while time.time() < deadline:
        sieve = api("POST", "/sieve")
        if isinstance(sieve, dict) and "error" not in sieve:
            labels = [(e.get("label") or "").lower() for e in sieve.get("elements", [])]
            if not any(not_text in l for l in labels):
                return sieve
        time.sleep(1.5)
    return sieve


# =========================================================================
# WORKFLOW 1: eBay competitor earbuds pricing
# =========================================================================

def workflow_ebay():
    print("\n" + "="*60)
    print("WORKFLOW 1: eBay Competitor Pricing")
    print("="*60 + "\n")

    # 1. Search for wireless earbuds
    sieve = observe(
        url="https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds",
        label="ebay-search", wait=2.0)

    # 2. Extract product URLs from sieve inventory
    products = []
    for i, e in enumerate(sieve.get("elements", [])):
        label = (e.get("label") or "")
        href = (e.get("locators", {}).get("href") or "")
        if "Opens in a new window" in label and "/itm/" in href:
            name = label.replace(" Opens in a new window or tab", "")
            products.append({"name": name, "url": href.split("?")[0]})
    print(f"\n  Found {len(products)} product listings")

    # 3. Visit top 3, extract prices
    prices = []
    for product in products[:3]:
        prod_sieve = observe(url=product["url"],
                            label=f"ebay-product-{len(prices)+1}", wait=1.5)
        for i, e in enumerate(prod_sieve.get("elements", [])):
            label = (e.get("label") or "")
            if e.get("category") == "readable" and label.startswith("US $"):
                price = label.split("/")[0].strip()
                prices.append({"name": product["name"][:50], "price": price})
                print(f"  💰 {product['name'][:40]}: {price}")
                log_entries.append({
                    "step": step_counter + 0.5, "tool": "extract",
                    "label": "extract-price",
                    "product": product["name"][:50], "price": price,
                    "t": round(time.time() - T0, 2),
                    "end_t": round(time.time() - T0, 2),
                })
                break

    # 4. Return to search
    observe(url="https://www.ebay.com/sch/i.html?_nkw=wireless+earbuds",
            label="ebay-done", wait=1.0)

    print(f"\n  ✅ Collected {len(prices)} prices:")
    for p in prices:
        print(f"     {p['name']}: {p['price']}")
    return prices


# =========================================================================
# WORKFLOW 2: ReserveCalifornia campsite booking
# =========================================================================

def workflow_rc():
    print("\n" + "="*60)
    print("WORKFLOW 2: ReserveCalifornia Campsite Booking")
    print("="*60 + "\n")

    # 1. Navigate to homepage
    sieve = observe(url="https://www.reservecalifornia.com/",
                    label="rc-home", wait=4.0)

    # 2. Type park name into search
    idx, _ = find_el(sieve, label_contains="Search by City or Park", category="typable")
    if idx is None:
        sieve = observe(label="rc-home-retry", wait=2.0)
        idx, _ = find_el(sieve, label_contains="Search by City or Park", category="typable")
    assert idx is not None, "Search field not found"
    fill(idx, "Big Basin", label="rc-search-fill", wait=1.5)

    # 3. Click "Search All" link (the <a> tag, not the container span)
    sieve = observe(label="rc-dropdown", wait=0.5)
    idx, _ = find_el(sieve, label_exact="Search All", tag="a")
    assert idx is not None, "'Search All' link not found"
    click(idx, label="rc-search-all", wait=1.5)

    # 4. Date picker — click the date range selector
    sieve = observe(label="rc-date-page", wait=1.0)
    idx, _ = find_el(sieve, label_contains="Select Arrival")
    assert idx is not None, "Date selector not found"
    click(idx, label="rc-open-calendar", wait=0.5)

    # 5. Calendar — click today's date (the first clickable gridcell)
    sieve = observe(label="rc-calendar", wait=0.5)
    idx, el = find_el(sieve, label_contains="Choose")
    assert idx is not None, "No clickable date found"
    click(idx, label="rc-pick-arrival", wait=0.5)

    # 6. Pick departure — find a "Choose" date after arrival (skip first match)
    sieve = observe(label="rc-departure-cal", wait=0.5)
    departure_picked = False
    chooseable = []
    for i, e in enumerate(sieve.get("elements", [])):
        el_label = (e.get("label") or "")
        if "Choose" in el_label and e.get("ariaRole") == "gridcell":
            chooseable.append((i, el_label))
    # Pick the second chooseable date (first is likely the arrival date)
    if len(chooseable) >= 2:
        click(chooseable[1][0], label="rc-pick-departure", wait=0.5)
        departure_picked = True
    elif chooseable:
        click(chooseable[0][0], label="rc-pick-departure", wait=0.5)
        departure_picked = True
    if not departure_picked:
        print("  ⚠ No departure date found to click")

    # 7. Site type selection — skip, just click Show Results
    sieve = observe(label="rc-site-type", wait=0.5)
    idx, _ = find_el(sieve, label_contains="Show Results", category="clickable")
    if idx is not None:
        click(idx, label="rc-show-results", wait=3.0)

    # 8. Wait for results
    print("  Waiting for results...")
    loaded = wait_for_load(timeout=15)
    sieve = observe(label="rc-results", wait=0.5)

    # 9. Find a park with available sites (in viewport)
    found = False
    for i, e in enumerate(sieve.get("elements", [])):
        label = (e.get("label") or "")
        if "Available Sites" in label and " 0 Available" not in label:
            click(i, label="rc-select-park", wait=3.0)
            found = True
            break
    if not found:
        # Try the "Parks with availability" filter
        idx, _ = find_el(sieve, label_contains="Parks with availability")
        if idx is not None:
            click(idx, label="rc-filter-avail", wait=3.0)

    # 10. Wait for park page
    print("  Waiting for park page...")
    wait_for_load(timeout=15)
    sieve = observe(label="rc-park", wait=1.0)

    # 11. Select a campground with availability
    for i, e in enumerate(sieve.get("elements", [])):
        label = (e.get("label") or "")
        if "Available" in label and "Starting at" in label:
            click(i, label="rc-select-campground", wait=2.0)
            break

    # 12. See available sites in the campground
    sieve = observe(label="rc-campground", wait=1.5)

    # 13. Click an available campsite (element with "available" in label
    #     and a site-* id in locators)
    for i, e in enumerate(sieve.get("elements", [])):
        label = (e.get("label") or "")
        if "available" in label.lower() and "not available" not in label.lower():
            site_id = e.get("locators", {}).get("id", "")
            if site_id.startswith("site-"):
                click(i, label="rc-click-site", wait=1.0)
                break

    # 14. Click Book Now
    sieve = observe(label="rc-site-detail", wait=0.5)
    idx, _ = find_el(sieve, label_contains="Book Now", category="clickable")
    if idx is not None:
        click(idx, label="rc-book-now", wait=1.5)
    else:
        print("  ⚠ Book Now button not found")

    # 15. Login wall
    sieve = observe(label="rc-login-wall", wait=0.5)
    has_login = any("please login" in (e.get("label") or "").lower()
                    or "login" == (e.get("label") or "").strip().lower()
                    for e in sieve.get("elements", []))

    if has_login:
        print("\n  🔒 Login required — booking workflow stops here")
    else:
        print("\n  ⚠ Did not detect login wall")
    print("  ✅ ReserveCalifornia workflow complete")


# =========================================================================

def main():
    status = api("GET", "/status")
    if not (isinstance(status, dict) and status.get("ready")):
        print(f"ERROR: Sieve server not available at {SIEVE}")
        sys.exit(1)
    print(f"Sieve server ready at {SIEVE}\n")

    for f in os.listdir(OUT):
        if f.endswith(".png"):
            os.remove(os.path.join(OUT, f))

    workflow_ebay()
    workflow_rc()

    log_path = os.path.join(BASE, "workflow-log.json")
    clean = [{k: v for k, v in e.items() if k != "_sieve"} for e in log_entries]
    with open(log_path, "w") as f:
        json.dump(clean, f, indent=2, default=str)
    print(f"\n📝 Log: {log_path}")
    print(f"📸 Screenshots: {OUT}/")


if __name__ == "__main__":
    main()
