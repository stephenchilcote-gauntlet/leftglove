#!/usr/bin/env python3
"""
Add curated short `name` fields to non-chrome elements in workflow-sieves.json.

The `label` field contains raw HTML accessible names (aria-label, innerText, etc.).
This script adds a `name` field with concise, human-readable descriptions for the
terminal display. Elements without a `name` entry keep their existing `label`.

Run from any directory:
    python3 leftglove/toddler/demo3/curate-labels.py
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(BASE, "workflow-sieves.json")

# ──────────────────────────────────────────────────────────────────────────────
# Name tables: {sieve_key: {element_index: "short name"}}
# Only include elements whose existing label is too long or confusing.
# ──────────────────────────────────────────────────────────────────────────────

NAMES = {
    "ebay-search": {
        28:  "Category selector",
        78:  "Min price",
        79:  "Max price",
        80:  "Apply price",
        84:  "New (549k+)",
        86:  "Used (54k+)",
        149: "Save this search",
        173: "Wicked Audio Bandido",
        176: "JLab Go POP+",
        183: "AI Translation Earbuds",
        188: "Beats Fit Pro",
    },
    "ebay-product-1": {
        134: "Wicked Audio Bandido earbuds",
        137: "853 reviews",
        143: "$29.95",
        145: "New",
        168: "Located in: Perry, GA",
    },
    "ebay-product-2": {
        313: "JLab Go POP+ earbuds",
        316: "6017 reviews",
        322: "$29.99",
        324: "New",
        357: "Located in: Carlsbad, CA",
    },
    "ebay-product-3": {
        140: "AI Translation earbuds",
        143: "40 reviews",
        149: "$36.00",
        163: "New",
        194: "Located in: Rancho Cucamonga, CA",
    },
    "ebay-done": {
        169: "Wicked Audio Bandido",
        172: "JLab Go POP+",
        179: "AI Translation Earbuds",
        184: "Beats Fit Pro",
    },
    "rc-home": {
        19:  "Reserve CA state parks",
    },
    "rc-dropdown": {
        21:  "Search type dropdown",
    },
    "rc-date-page": {
        3:   "Arrival booking window",
    },
    "rc-calendar": {
        3:   "Arrival booking window",
        29:  "Apr 12 (not available)",
        30:  "Apr 13 (not available)",
        31:  "Apr 14 (not available)",
        32:  "Apr 15 ← select",
        33:  "Apr 16",
        34:  "Apr 17",
        35:  "Apr 18",
    },
    "rc-departure-cal": {
        3:   "Arrival booking window",
        31:  "Apr 14 (not available)",
        32:  "Apr 15 ✓ selected",
        33:  "Apr 16",
        34:  "Apr 17 ← select",
        35:  "Apr 18",
        36:  "Apr 19",
        37:  "Apr 20",
    },
    "rc-site-type": {
        3:   "Site type instructions",
        8:   "ADA info",
    },
    "rc-results": {
        14:  "Search: All, Apr 15–17",
        23:  "Available: Apr 15–17",
        27:  "Nearby parks (≤70 mi)",
        34:  "San Onofre SB (94 avail)",
    },
    "rc-park": {
        30:  "5 facilities available",
        31:  "Available: Apr 15–17, San Onofre",
        32:  "San Mateo 101–140 ($45, 31 avail)",
        34:  "San Mateo 141–157 ($45, 12 avail)",
        36:  "San Mateo 1–67 ($65, 32 avail)",
        38:  "San Mateo 68–100 ($40, 18 avail)",
        40:  "Group Site ($250, 1 avail)",
        43:  "No availability currently",
        44:  "Bluffs Group Camp ($250)",
        46:  "$250.00/night",
    },
    "rc-campground": {
        20:  "Search: San Onofre, Apr 15–17",
        49:  "S102 Apr 15 ← available",
        51:  "S102 Apr 16 available",
        52:  "S102 Apr 17 not available",
        53:  "S102 Apr 18 not available",
        55:  "S102 Apr 19 available",
        57:  "S102 Apr 20 available",
        59:  "S102 Apr 21 available",
        62:  "S103 Apr 15 available",
        64:  "S103 Apr 16 available",
        65:  "S103 Apr 17 not available",
        66:  "S103 Apr 18 not available",
        68:  "S103 Apr 19 available",
        70:  "S103 Apr 20 available",
        72:  "S103 Apr 21 available",
        75:  "S107 Apr 15 available",
        77:  "S107 Apr 16 available",
        78:  "S107 Apr 17 not available",
        79:  "S107 Apr 18 not available",
    },
    "rc-site-detail": {
        20:  "Search: San Onofre, Apr 15–17",
        555: "Unit Details",
    },
    "rc-login-wall": {
        20:  "Search: San Onofre, Apr 15–17",
    },
}


def main():
    with open(PATH) as f:
        data = json.load(f)

    print("Adding curated names to workflow-sieves.json...\n")
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
        print(f"  {key:<22}  {applied} names")
        total += applied

    with open(PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nTotal: {total} names added. Saved.")


if __name__ == "__main__":
    main()
