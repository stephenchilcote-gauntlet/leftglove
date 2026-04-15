#!/usr/bin/env python3
"""
Curate workflow-sieves.json: reclassify chrome-level elements for all sieve keys.
Goal: each page shows 10–25 task-relevant elements instead of 400–600.

Run from any directory:
    python3 leftglove/toddler/demo3/curate-sieves.py
"""
import json
import re
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(BASE, "workflow-sieves.json")


def mark_chrome(el):
    el["category"] = "chrome"
    el["roles"] = ["chrome"]


def is_chrome(el):
    return el.get("category") == "chrome"


def is_svg(el):
    return el.get("tag") in ("svg", "path", "g")


def empty_label(el):
    return len((el.get("label") or "").strip()) <= 1


def region_starts(el, *prefixes):
    r = el.get("region") or ""
    return any(r == p or r.startswith(p + " ") or r.startswith(p + ">") for p in prefixes)


# ──────────────────────────────────────────────────────────────────
# eBay Product Pages  (price-extraction target)
# Explicit keep-lists: title, seller, price, condition, buy, shipping, returns
# Everything else → chrome
# ──────────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────
# eBay Search  (the list page — already manually curated in prior pass)
# Preserve exactly those 27 elements.
# ──────────────────────────────────────────────────────────────────

KEEP_EBAY_SEARCH = {
    26, 28, 29,              # search input, category select, Search button
    65, 72, 74, 76,          # Free Shipping, price-range filters
    78, 79, 80,              # Min/Max price inputs, Apply button
    84, 86,                  # Condition: New, Used
    95, 97, 99,              # Format: Auction, Buy It Now, Accepts Offers
    148, 149,                # "180,000+ results", Save this search
    151, 152, 153, 154, 156, 158,  # format/condition/location/sort tabs
    173, 176, 183, 188,      # the 4 earbuds product links
}

def curate_ebay_search(elements):
    _keep_explicit(elements, KEEP_EBAY_SEARCH)


# product-1: Wicked Audio Bandido  ($29.95)
KEEP_EBAY_P1 = {
    134,                # h1: product title
    136, 137, 138,      # seller name, review count, positive %
    143, 144, 145,      # price, "Condition:", "New New"
    150, 151,           # Buy It Now, Add to cart
    162, 163, 164,      # Shipping section h2, "Shipping:", "Free"
    168, 169,           # "Located in:", "Delivery:"
    178, 179,           # "Returns:", policy text
}

# product-2: JLab Go POP+  ($29.99)
KEEP_EBAY_P2 = {
    313,                # h1
    315, 316, 317,      # seller, reviews, positive %
    322, 323, 324,      # price, "Condition:", "New New"
    334, 335,           # Buy It Now, Add to cart
    349, 350, 351,      # Shipping section, "Shipping:", "Free 2-4 day delivery"
    357, 358, 359,      # "Located in:", "Returns:", "30 days returns"
}

# product-3: AI Translation Earbuds  ($36.00 / was $179.99)
KEEP_EBAY_P3 = {
    140,                # h1
    142, 143, 144,      # seller, reviews, positive %
    149, 150,           # price, was-price (80% off)
    162, 163,           # "Condition:", "New New"
    172, 173,           # Buy It Now, Add to cart
    187, 188, 189,      # Shipping section, "Shipping:", "Free"
    194, 204,           # "Located in:", "Returns:"
}

# done: back to search results — show count + the 4 products we analysed
KEEP_EBAY_DONE = {
    144,                           # h1: "180,000+ results for wireless earbuds"
    147, 148, 149, 150, 152, 154,  # tab-bar: All, Auction, Buy It Now, Condition, Location, Sort
    169, 172, 179, 184,            # the 4 earbuds product links
}


def _keep_explicit(elements, keep_set):
    """Chrome every non-chrome element whose index is not in keep_set."""
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in keep_set:
            continue
        mark_chrome(el)


def curate_ebay_product_1(elements):
    _keep_explicit(elements, KEEP_EBAY_P1)

def curate_ebay_product_2(elements):
    _keep_explicit(elements, KEEP_EBAY_P2)

def curate_ebay_product_3(elements):
    _keep_explicit(elements, KEEP_EBAY_P3)

def curate_ebay_done(elements):
    _keep_explicit(elements, KEEP_EBAY_DONE)


# ──────────────────────────────────────────────────────────────────
# RC Home  (fill index=23: search input)
# Keep: search input + banner headings (3 elements)
# ──────────────────────────────────────────────────────────────────

KEEP_RC_HOME = {19, 20, 23}


def curate_rc_home(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in KEEP_RC_HOME:
            continue
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Dropdown  (click index=24: "Search All")
# Keep: search input, dropdown, quick-location links, submit
# ──────────────────────────────────────────────────────────────────

KEEP_RC_DROPDOWN = {21, 23, 24, 25, 26, 27, 28, 29}


def curate_rc_dropdown(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in KEEP_RC_DROPDOWN:
            continue
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Date Page  (14 elements — already small; click index=4)
# Just strip SVGs, empty labels, and header/footer regions.
# ──────────────────────────────────────────────────────────────────

def curate_rc_date_page(elements):
    for el in elements:
        if is_chrome(el):
            continue
        if is_svg(el):
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        if region_starts(el, "header", "contentinfo"):
            mark_chrome(el); continue


# ──────────────────────────────────────────────────────────────────
# RC Calendar / Departure-Cal  (595 non-chrome each)
# Keep: exit, headings, month nav, click target ± 3 neighbours
# Chrome: all other gridcell day-cells, day-header labels, SVGs
# ──────────────────────────────────────────────────────────────────

def curate_rc_calendar(elements, click_idx, n_nearby=3):
    core = {0, 2, 3, 5, 8, 9, 10}          # exit, heading, desc, select, nav, month
    window = set(range(max(0, click_idx - n_nearby), click_idx + n_nearby + 1))
    keep = core | window

    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in keep:
            continue
        if el.get("elementType") == "gridcell":
            mark_chrome(el); continue
        label = (el.get("label") or "").strip()
        if label in ("Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"):
            mark_chrome(el); continue
        if is_svg(el):
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        if region_starts(el, "header", "contentinfo"):
            mark_chrome(el); continue
        # Everything that's not in keep → chrome
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Site Type  (16 elements — already small; click index=13)
# ──────────────────────────────────────────────────────────────────

def curate_rc_site_type(elements):
    for el in elements:
        if is_chrome(el):
            continue
        if is_svg(el):
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        if region_starts(el, "header", "contentinfo"):
            mark_chrome(el); continue


# ──────────────────────────────────────────────────────────────────
# RC Results  (273 non-chrome; click index=34)
# Keep: search summary, click target (San Onofre result), nearby-places heading
# Chrome: map markers, duplicate result items, header nav, lottery promo
# ──────────────────────────────────────────────────────────────────

KEEP_RC_RESULTS = {14, 21, 22, 23, 26, 27, 34}

_RC_LOTTERY_LABELS = {
    "Enter the Lottery Drawing Today!",
    "Enter a drawing now!",
}


def curate_rc_results(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in KEEP_RC_RESULTS:
            continue
        if is_svg(el) or el.get("tag") == "img":
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        label = (el.get("label") or "").strip()
        if region_starts(el, "header", "contentinfo", "banner"):
            mark_chrome(el); continue
        if label.startswith("Click to move to"):
            mark_chrome(el); continue
        if label in _RC_LOTTERY_LABELS or label.startswith("We're excited"):
            mark_chrome(el); continue
        if label.startswith("error Img"):
            mark_chrome(el); continue
        # Duplicate empty-label div links (map markers)
        if el.get("tag") == "div" and el.get("elementType") == "link":
            mark_chrome(el); continue
        # Everything else not in keep
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Park  (151 non-chrome; click index=32)
# Keep: search summary, all facility entries (5 campgrounds), "Other Facilities"
# Chrome: header/nav, lottery promo, footer
# ──────────────────────────────────────────────────────────────────

KEEP_RC_PARK = set(range(27, 48))   # Back to Search, h1, facilities list


def curate_rc_park(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        # Always chrome SVGs and empty labels, even if in keep range
        if is_svg(el) or el.get("tag") == "img":
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        if i in KEEP_RC_PARK:
            continue
        label = (el.get("label") or "").strip()
        if region_starts(el, "header", "contentinfo", "banner"):
            mark_chrome(el); continue
        if label.startswith("Click to move to"):
            mark_chrome(el); continue
        if label in _RC_LOTTERY_LABELS or label.startswith("We're excited"):
            mark_chrome(el); continue
        if label.startswith("error Img"):
            mark_chrome(el); continue
        if label in ("Log in / Sign up", "Cart", "Toggle navigation",
                     "Alert", "Share", "Directions", "Park Info"):
            mark_chrome(el); continue
        # Chrome everything beyond the facility list
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Campground  (543 non-chrome; click index=49)
# Keep: park banner, campground context, date headers, first 3 site rows (S102/103/107)
# Chrome: rest of table, header nav, lottery promo, footer
# ──────────────────────────────────────────────────────────────────

#  15  = "San Onofre SB" (park name)
#  20  = search-context button
#  27  = Back to Park
#  30  = campground name button
#  34, 37–46 = site-list label, week nav, date column headers
#  47–79 = first three site rows (S102, S103, S107) + availability cells
KEEP_RC_CAMPGROUND = (
    {15, 20, 27, 30, 34, 37, 38, 39}
    | set(range(40, 80))        # date headers + S102, S103, S107 rows
)

_RC_BANNER_CHROME = {
    "Log in / Sign up", "Cart", "Toggle navigation",
    "Alert", "Share", "Directions", "Park Info", "Site Legend",
}


def curate_rc_campground(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        # Chrome empty labels and SVGs before checking keep-set
        # (empty td cells in the availability table must not show)
        if is_svg(el) or el.get("tag") == "img":
            mark_chrome(el); continue
        if empty_label(el):
            mark_chrome(el); continue
        if i in KEEP_RC_CAMPGROUND:
            continue
        if is_svg(el) or el.get("tag") == "img":
            mark_chrome(el); continue
        if region_starts(el, "header", "contentinfo", "banner"):
            mark_chrome(el); continue
        label = (el.get("label") or "").strip()
        if label.startswith("Click to move to"):
            mark_chrome(el); continue
        if label in _RC_LOTTERY_LABELS or label.startswith("We're excited"):
            mark_chrome(el); continue
        if label.startswith("error Img"):
            mark_chrome(el); continue
        if label in _RC_BANNER_CHROME:
            mark_chrome(el); continue
        # Chrome everything beyond first-3-sites table
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Site Detail  (557 non-chrome; click index=554 = "Book Now")
# Keep: park name, campground, site name + price + date + Book Now
# Chrome: all table rows, everything else
# ──────────────────────────────────────────────────────────────────

KEEP_RC_SITE_DETAIL = {
    15,          # "San Onofre SB"
    20,          # search-context button
    29, 30,      # campground name
    548, 549,    # site name + price
    551, 552,    # date + duration select
    554, 555,    # Book Now + Unit Details
}


def curate_rc_site_detail(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in KEEP_RC_SITE_DETAIL:
            continue
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# RC Login Wall  (557 non-chrome; no click — end of workflow)
# Same structure as site-detail; show site summary + login/close prompt
# ──────────────────────────────────────────────────────────────────

KEEP_RC_LOGIN_WALL = {
    15,          # "San Onofre SB"
    20,          # search-context button
    29, 30,      # campground name
    548, 549,    # site name + price
    551, 552,    # date + duration select
    554, 564,    # "Book Now" (greyed) + "Close"
}


def curate_rc_login_wall(elements):
    for i, el in enumerate(elements):
        if is_chrome(el):
            continue
        if i in KEEP_RC_LOGIN_WALL:
            continue
        mark_chrome(el)


# ──────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────

CURATORS = {
    "ebay-search":      curate_ebay_search,
    "ebay-product-1":   curate_ebay_product_1,
    "ebay-product-2":   curate_ebay_product_2,
    "ebay-product-3":   curate_ebay_product_3,
    "ebay-done":        curate_ebay_done,
    "rc-home":          curate_rc_home,
    "rc-dropdown":      curate_rc_dropdown,
    "rc-date-page":     curate_rc_date_page,
    "rc-calendar":      lambda els: curate_rc_calendar(els, click_idx=32),
    "rc-departure-cal": lambda els: curate_rc_calendar(els, click_idx=34),
    "rc-site-type":     curate_rc_site_type,
    "rc-results":       curate_rc_results,
    "rc-park":          curate_rc_park,
    "rc-campground":    curate_rc_campground,
    "rc-site-detail":   curate_rc_site_detail,
    "rc-login-wall":    curate_rc_login_wall,
}


def main():
    with open(PATH) as f:
        data = json.load(f)

    print("Curating workflow-sieves.json...\n")
    for key, curator in CURATORS.items():
        elements = data[key]["elements"]
        before = sum(1 for e in elements if e.get("category") != "chrome")
        curator(elements)
        after = sum(1 for e in elements if e.get("category") != "chrome")
        print(f"  {key:<22}  {before:4d} → {after:3d} non-chrome")

    with open(PATH, "w") as f:
        json.dump(data, f, indent=2)

    print("\nSaved.")


if __name__ == "__main__":
    main()
