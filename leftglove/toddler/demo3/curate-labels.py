#!/usr/bin/env python3
"""
Add curated `name` fields to non-chrome elements in workflow-sieves.json.

Names are functional/purpose-based (like auto-classify would produce):
  "buy-now", "price", "park-search", "condition-new"
NOT rephrased page text.

Run after curate-sieves.py (which handles chrome classification).

Run from any directory:
    python3 leftglove/toddler/demo3/curate-labels.py
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(BASE, "workflow-sieves.json")

# ──────────────────────────────────────────────────────────────────────────────
# Name tables: {sieve_key: {element_index: "functional-name"}}
# Cover every non-chrome element on every page.
# ──────────────────────────────────────────────────────────────────────────────

NAMES = {
    # ─── eBay Search ────────────────────────────────────────────────────────
    "ebay-search": {
        26:  "search-input",
        28:  "category",
        29:  "search",
        65:  "filter-free-shipping",
        72:  "filter-price-under-13",
        74:  "filter-price-13-to-25",
        76:  "filter-price-over-25",
        78:  "price-min",
        79:  "price-max",
        80:  "price-apply",
        84:  "condition-new",
        86:  "condition-used",
        95:  "format-auction",
        97:  "format-buy-now",
        99:  "format-offers",
        148: "result-count",
        149: "save-search",
        151: "tab-all",
        152: "tab-auction",
        153: "tab-buy-now",
        154: "tab-condition",
        156: "tab-location",
        158: "tab-sort",
        173: "product-bandido",
        176: "product-jlab",
        183: "product-ai-earbuds",
        188: "product-beats",
    },

    # ─── eBay Product Pages ──────────────────────────────────────────────────
    "ebay-product-1": {
        134: "product-title",
        136: "seller",
        137: "review-count",
        138: "seller-rating",
        143: "price",
        145: "condition",
        150: "buy-now",
        151: "add-to-cart",
        164: "shipping",
        179: "returns-policy",
    },
    "ebay-product-2": {
        313: "product-title",
        315: "seller",
        316: "review-count",
        317: "seller-rating",
        322: "price",
        324: "condition",
        334: "buy-now",
        335: "add-to-cart",
        351: "shipping",
        359: "returns-policy",
    },
    "ebay-product-3": {
        140: "product-title",
        142: "seller",
        143: "review-count",
        144: "seller-rating",
        149: "price",
        150: "was-price",
        163: "condition",
        172: "buy-now",
        173: "add-to-cart",
        189: "shipping",
        204: "returns-policy",
    },

    # ─── eBay Done (back to search) ──────────────────────────────────────────
    "ebay-done": {
        144: "result-count",
        147: "tab-all",
        148: "tab-auction",
        149: "tab-buy-now",
        150: "tab-condition",
        152: "tab-location",
        154: "tab-sort",
        169: "product-bandido",
        172: "product-jlab",
        179: "product-ai-earbuds",
        184: "product-beats",
    },

    # ─── ReserveCalifornia ───────────────────────────────────────────────────
    "rc-home": {
        23:  "park-search",
    },
    "rc-dropdown": {
        21:  "search-type",
        23:  "park-search",
        24:  "search-all",
        25:  "south-carlsbad-sb",
        26:  "san-elijo-sb",
        27:  "carpinteria-sb",
        28:  "pfeiffer-big-sur",
        29:  "pismo-sb",
    },
    "rc-date-page": {
        0:   "exit",
        5:   "arrival-date",
        8:   "site-type-next",
        9:   "back",
        11:  "show-results",
    },
    "rc-calendar": {
        0:   "exit",
        5:   "arrival-date",
        8:   "prev-month",
        9:   "next-month",
        10:  "month-heading",
        29:  "apr-12-unavail",
        30:  "apr-13-unavail",
        31:  "apr-14-unavail",
        32:  "apr-15",
        33:  "apr-16",
        34:  "apr-17",
        35:  "apr-18",
    },
    "rc-departure-cal": {
        0:   "exit",
        5:   "arrival-date",
        8:   "prev-month",
        9:   "next-month",
        10:  "month-heading",
        31:  "apr-14-unavail",
        32:  "apr-15-selected",
        33:  "apr-16",
        34:  "apr-17",
        35:  "apr-18",
        36:  "apr-19",
        37:  "apr-20",
    },
    "rc-site-type": {
        0:   "exit",
        4:   "site-type-select",
        5:   "ada-only",
        11:  "back",
        13:  "show-results",
    },
    "rc-results": {
        14:  "search-context",
        34:  "san-onofre-sb",
    },
    "rc-park": {
        27:  "back-to-search",
        30:  "facility-count",
        32:  "san-mateo-101-140",
        34:  "san-mateo-141-157",
        36:  "san-mateo-1-67",
        38:  "san-mateo-68-100",
        40:  "group-site",
        42:  "other-facilities",
        44:  "bluffs-group-camp",
        47:  "show-next-available",
    },
    "rc-campground": {
        15:  "park-name",
        20:  "search-context",
        27:  "back-to-park",
        30:  "campground-name",
        37:  "prev-week",
        39:  "next-week",
        40:  "date-wed-15",
        41:  "date-thu-16",
        42:  "date-fri-17",
        43:  "date-sat-18",
        44:  "date-sun-19",
        45:  "date-mon-20",
        46:  "date-tue-21",
        47:  "site-s102",
        49:  "s102-apr15",
        51:  "s102-apr16",
        52:  "s102-apr17-unavail",
        53:  "s102-apr18-unavail",
        55:  "s102-apr19",
        57:  "s102-apr20",
        59:  "s102-apr21",
        60:  "site-s103",
        62:  "s103-apr15",
        64:  "s103-apr16",
        65:  "s103-apr17-unavail",
        66:  "s103-apr18-unavail",
        68:  "s103-apr19",
        70:  "s103-apr20",
        72:  "s103-apr21",
        73:  "site-s107",
        75:  "s107-apr15",
        77:  "s107-apr16",
        78:  "s107-apr17-unavail",
        79:  "s107-apr18-unavail",
    },
    "rc-site-detail": {
        15:  "park-name",
        20:  "search-context",
        30:  "campground-name",
        548: "site-name",
        549: "site-price",
        551: "arrival-date",
        552: "duration",
        554: "book-now",
        555: "unit-details",
    },
    "rc-login-wall": {
        15:  "park-name",
        20:  "search-context",
        30:  "campground-name",
        548: "site-name",
        549: "site-price",
        551: "arrival-date",
        552: "duration",
        554: "book-now",
        564: "close",
    },
}


def main():
    with open(PATH) as f:
        data = json.load(f)

    print("Adding functional names to workflow-sieves.json...\n")
    total = 0
    for key, name_map in NAMES.items():
        if key not in data:
            print(f"  WARNING: key '{key}' not found in JSON")
            continue
        elements = data[key]["elements"]
        applied = 0
        for idx, name in name_map.items():
            if idx < len(elements):
                elements[idx]["name"] = name
                applied += 1
        non_chrome = sum(1 for e in elements if e.get("category") != "chrome")
        covered = sum(
            1 for i, e in enumerate(elements)
            if e.get("category") != "chrome" and i in name_map
        )
        print(f"  {key:<22}  {non_chrome:2d} non-chrome  {covered:2d} named")
        if covered < non_chrome:
            unnamed = [
                (i, e.get("label", "")[:50])
                for i, e in enumerate(elements)
                if e.get("category") != "chrome" and i not in name_map
            ]
            for idx, lbl in unnamed:
                print(f"    WARNING unnamed [{idx}]: {repr(lbl)}")
        total += applied

    with open(PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nTotal: {total} names. Saved.")


if __name__ == "__main__":
    main()
