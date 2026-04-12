#!/usr/bin/env python3
"""
Generate asciinema .cast files for the LeftGlove + OpenClaw hype demo.

Four segments:
  1. Amazon MCP vocabulary
  2. Contrast: with vs without LeftGlove
  3. Campsite MCP vocabulary
  4. Campsite interaction (6-step form fill)

Output: demo2/casts/segment-*.cast
"""

import json
from pathlib import Path

CAST_DIR = Path(__file__).parent / "casts"
CAST_DIR.mkdir(exist_ok=True)

COLS = 120
ROWS = 35
SHELL = "/bin/bash"

# Typing speed: seconds per character
CHAR_DELAY = 0.035
# Pause after pressing Enter before output appears
OUTPUT_DELAY = 0.3
# Pause between output lines
LINE_DELAY = 0.02
# Pause after a block of output before next command
BLOCK_PAUSE = 1.5


def make_header():
    return {
        "version": 2,
        "width": COLS,
        "height": ROWS,
        "env": {"SHELL": SHELL, "TERM": "xterm-256color"},
    }


def write_cast(filename: str, events: list):
    """Write an asciinema v2 .cast file."""
    filepath = CAST_DIR / filename
    with open(filepath, "w") as f:
        f.write(json.dumps(make_header()) + "\n")
        for ts, etype, data in events:
            f.write(json.dumps([round(ts, 6), etype, data]) + "\n")
    print(f"  Written: {filepath}")
    return filepath


def type_command(events: list, t: float, cmd: str) -> float:
    """Simulate typing a command character by character."""
    events.append((t, "o", "\x1b[32m$ \x1b[0m"))
    t += 0.1
    for ch in cmd:
        events.append((t, "o", ch))
        t += CHAR_DELAY
    events.append((t, "o", "\r\n"))
    t += OUTPUT_DELAY
    return t


def show_output(events: list, t: float, lines: list, delay=LINE_DELAY) -> float:
    """Display output lines."""
    for line in lines:
        events.append((t, "o", line + "\r\n"))
        t += delay
    return t


def hold(events: list, t: float, secs: float) -> float:
    """Add a no-op event to hold the terminal display."""
    t += secs
    events.append((t, "o", ""))
    return t


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 1 — Amazon MCP Vocabulary (~17s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_amazon_vocab():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── MCP Tool Surface ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "echo '{\"method\":\"tools/list\"}' | node dist/index.js | jq '.tools[].name'")
    t = show_output(events, t, [
        '\x1b[33m"observe"\x1b[0m',
        '\x1b[33m"list_vocabulary"\x1b[0m',
        '\x1b[33m"refresh_vocabulary"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    t = type_command(events, t, "echo '{\"method\":\"tools/call\",\"params\":{\"name\":\"list_vocabulary\"}}' | node dist/index.js | jq '.content[0].text' -r")
    t = show_output(events, t, [
        '\x1b[1mIntent: Amazon\x1b[0m',
        '  \x1b[32m✓\x1b[0m product-title       \x1b[90m(readable)    [data-testid="productTitle"]\x1b[0m            verbs: see',
        '  \x1b[32m✓\x1b[0m price               \x1b[90m(readable)    [data-testid="price-value"]\x1b[0m             verbs: see',
        '  \x1b[32m✓\x1b[0m buy-box             \x1b[90m(chrome)      [data-testid="buy-box"]\x1b[0m                 verbs: —',
        '  \x1b[32m✓\x1b[0m add-to-cart         \x1b[90m(clickable)   [data-testid="add-to-cart-button"]\x1b[0m      verbs: click',
        '  \x1b[32m✓\x1b[0m buy-now             \x1b[90m(clickable)   [data-testid="buy-now-button"]\x1b[0m          verbs: click',
        '  \x1b[32m✓\x1b[0m quantity-selector   \x1b[90m(selectable)  [data-testid="quantity"]\x1b[0m                verbs: select',
        '  \x1b[32m✓\x1b[0m variant-color       \x1b[90m(clickable)   [data-testid="color-swatch-0"]\x1b[0m          verbs: click',
        '  \x1b[32m✓\x1b[0m variant-size        \x1b[90m(clickable)   [data-testid="size-swatch-0"]\x1b[0m           verbs: click',
        '  \x1b[32m✓\x1b[0m delivery-date       \x1b[90m(readable)    [data-testid="delivery-message"]\x1b[0m        verbs: see',
        '  \x1b[32m✓\x1b[0m star-rating         \x1b[90m(readable)    [data-testid="average-star-rating"]\x1b[0m     verbs: see',
        '  \x1b[32m✓\x1b[0m review-count        \x1b[90m(readable)    [data-testid="ratings-count"]\x1b[0m           verbs: see',
        '  \x1b[32m✓\x1b[0m subscribe-save      \x1b[90m(clickable)   [data-testid="subscribe-and-save"]\x1b[0m      verbs: click',
    ])
    t = hold(events, t, 4.0)

    return write_cast("segment-1-amazon-vocab.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 2 — Contrast: With vs Without LeftGlove (~23s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_contrast():
    events = []
    t = 0.0

    # --- WITHOUT ---
    events.append((t, "o", "\x1b[1;31m── WITHOUT LeftGlove (vanilla OpenClaw) ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "openclaw run 'Add this item to my cart'")
    t = show_output(events, t, [
        '\x1b[90m[openclaw] Taking screenshot (1920×1080)...\x1b[0m',
        '\x1b[90m[openclaw] Sending to vision model...\x1b[0m',
        '\x1b[33m[openclaw] Tokens used: 2,147\x1b[0m',
    ], delay=0.4)
    t += 0.5
    t = show_output(events, t, [
        '\x1b[90m[openclaw] Vision model response:\x1b[0m',
        '  "I see a button labeled \'Add to Cart\' at approximately (1200, 450)."',
        '  "Trying CSS selector: \x1b[33m.a-button-input\x1b[0m"',
    ], delay=0.15)
    t += 0.8
    t = show_output(events, t, [
        '\x1b[31m[openclaw] ✗ Element not found.\x1b[0m',
        '\x1b[31m[openclaw] ✗ Selector changed after A/B test. Retrying with screenshot...\x1b[0m',
        '\x1b[33m[openclaw] Tokens used: 4,294  (2 screenshots)\x1b[0m',
    ])
    t = hold(events, t, 3.0)

    # --- WITH ---
    events.append((t, "o", "\r\n"))
    events.append((t, "o", "\x1b[1;32m── WITH LeftGlove ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "openclaw run 'Add this item to my cart'")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] observe() → sieve inventory\x1b[0m',
        '\x1b[90m[leftglove] Tokens for page understanding: \x1b[0m\x1b[1;32m0\x1b[0m',
    ], delay=0.3)
    t += 0.3
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mAmazon.add-to-cart\x1b[0m \x1b[90m→ clickable → [data-testid="add-to-cart-button"]\x1b[0m',
        '\x1b[32m[openclaw] ✓ Clicked Amazon.add-to-cart\x1b[0m',
    ])
    t += 0.5

    # Big token comparison
    t = show_output(events, t, [
        '',
        '\x1b[90m  ┌─────────────────────────────────────────────┐\x1b[0m',
        '\x1b[90m  │\x1b[0m  Page understanding tokens                  \x1b[90m│\x1b[0m',
        '\x1b[90m  │\x1b[0m                                             \x1b[90m│\x1b[0m',
        '\x1b[90m  │\x1b[0m  Without LeftGlove:  \x1b[31;1m4,294 tokens\x1b[0m  (2 tries) \x1b[90m│\x1b[0m',
        '\x1b[90m  │\x1b[0m  With LeftGlove:     \x1b[32;1m    0 tokens\x1b[0m  (1 try)   \x1b[90m│\x1b[0m',
        '\x1b[90m  └─────────────────────────────────────────────┘\x1b[0m',
    ])
    t = hold(events, t, 5.0)

    return write_cast("segment-2-contrast.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 3 — Campsite MCP Vocabulary (~12s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_campsite_vocab():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── Campsite Booking — MCP Vocabulary ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "echo '{\"method\":\"tools/call\",\"params\":{\"name\":\"list_vocabulary\"}}' | node dist/index.js | jq '.content[0].text' -r")
    t = show_output(events, t, [
        '\x1b[1mIntent: Campsite\x1b[0m',
        '  \x1b[32m✓\x1b[0m park-selector        \x1b[90m(selectable)  [data-testid="park-select"]\x1b[0m           verbs: select',
        '  \x1b[32m✓\x1b[0m arrival-date          \x1b[90m(typable)     [data-testid="arrival-date"]\x1b[0m          verbs: fill',
        '  \x1b[32m✓\x1b[0m departure-date        \x1b[90m(typable)     [data-testid="departure-date"]\x1b[0m        verbs: fill',
        '  \x1b[32m✓\x1b[0m campsite-type         \x1b[90m(selectable)  [data-testid="site-type"]\x1b[0m             verbs: select',
        '  \x1b[32m✓\x1b[0m equipment-length      \x1b[90m(typable)     [data-testid="equip-length"]\x1b[0m          verbs: fill',
        '  \x1b[32m✓\x1b[0m accessible-filter     \x1b[90m(clickable)   [data-testid="ada-filter"]\x1b[0m            verbs: click',
        '  \x1b[32m✓\x1b[0m search-availability   \x1b[90m(clickable)   [data-testid="search-btn"]\x1b[0m            verbs: click',
        '  \x1b[32m✓\x1b[0m results-grid          \x1b[90m(readable)    [data-testid="results-grid"]\x1b[0m          verbs: see',
        '  \x1b[32m✓\x1b[0m site-map              \x1b[90m(readable)    [data-testid="campground-map"]\x1b[0m        verbs: see',
    ])
    t = hold(events, t, 4.0)

    return write_cast("segment-3-campsite-vocab.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 4 — Campsite Interaction: 6-step form fill (~40s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_campsite_interact():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── Agent books a campsite ──\x1b[0m\r\n"))
    t += 0.5
    events.append((t, "o", "\x1b[90mPlanning: Book site #47 at Big Basin for July 4th weekend\x1b[0m\r\n"))
    t += 1.5

    # Step 1: Select park
    t = type_command(events, t, "openclaw select Campsite.park-selector 'Big Basin Redwoods'")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.park-selector\x1b[0m \x1b[90m→ selectable → [data-testid="park-select"]\x1b[0m',
        '\x1b[32m  ✓ Selected "Big Basin Redwoods"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    # Step 2: Fill arrival date
    t = type_command(events, t, "openclaw fill Campsite.arrival-date '07/03/2026'")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.arrival-date\x1b[0m \x1b[90m→ typable → [data-testid="arrival-date"]\x1b[0m',
        '\x1b[32m  ✓ Filled "07/03/2026"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    # Step 3: Fill departure date
    t = type_command(events, t, "openclaw fill Campsite.departure-date '07/06/2026'")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.departure-date\x1b[0m \x1b[90m→ typable → [data-testid="departure-date"]\x1b[0m',
        '\x1b[32m  ✓ Filled "07/06/2026"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    # Step 4: Select campsite type
    t = type_command(events, t, "openclaw select Campsite.campsite-type 'Tent'")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.campsite-type\x1b[0m \x1b[90m→ selectable → [data-testid="site-type"]\x1b[0m',
        '\x1b[32m  ✓ Selected "Tent"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    # Step 5: Search availability
    t = type_command(events, t, "openclaw click Campsite.search-availability")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.search-availability\x1b[0m \x1b[90m→ clickable → [data-testid="search-btn"]\x1b[0m',
        '\x1b[32m  ✓ Clicked — 12 sites available\x1b[0m',
    ])
    t += BLOCK_PAUSE

    # Step 6: Reserve site
    t = type_command(events, t, "openclaw click Campsite.site-47-reserve")
    t = show_output(events, t, [
        '\x1b[90m[leftglove] Resolved: \x1b[0m\x1b[1mCampsite.site-47-reserve\x1b[0m \x1b[90m→ clickable → [data-testid="reserve-site-47"]\x1b[0m',
        '\x1b[32m  ✓ Reserved — confirmation #RC-2026-88412\x1b[0m',
    ])
    t += 1.0

    # Summary
    t = show_output(events, t, [
        '',
        '\x1b[1;32m  ┌──────────────────────────────────────────────┐\x1b[0m',
        '\x1b[1;32m  │\x1b[0m  6/6 steps completed                          \x1b[1;32m│\x1b[0m',
        '\x1b[1;32m  │\x1b[0m  Tokens for page understanding: \x1b[1;32m0\x1b[0m              \x1b[1;32m│\x1b[0m',
        '\x1b[1;32m  │\x1b[0m  Retries: \x1b[1;32m0\x1b[0m                                    \x1b[1;32m│\x1b[0m',
        '\x1b[1;32m  │\x1b[0m  Reservation: \x1b[1mBig Basin #47, Jul 3–6 2026\x1b[0m     \x1b[1;32m│\x1b[0m',
        '\x1b[1;32m  └──────────────────────────────────────────────┘\x1b[0m',
    ])
    t = hold(events, t, 5.0)

    return write_cast("segment-4-campsite-interact.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Generating terminal segments...")
    segment_amazon_vocab()
    segment_contrast()
    segment_campsite_vocab()
    segment_campsite_interact()

    # Timing metadata — maps narration clips to offsets within each segment.
    # assemble.sh adds each segment's global start offset for final placement.
    timing = [
        # segment-1: Amazon vocabulary (~17s)
        {"segment": "segment-1-amazon-vocab", "clipId": "amazon-vocab", "t": 200},
        # segment-2: contrast (~23s)
        {"segment": "segment-2-contrast", "clipId": "contrast-without", "t": 200},
        {"segment": "segment-2-contrast", "clipId": "contrast-with", "t": 12000},
        # segment-3: Campsite vocabulary (~12s)
        {"segment": "segment-3-campsite-vocab", "clipId": "campsite-vocab", "t": 200},
        # segment-4: Campsite interaction (~40s)
        {"segment": "segment-4-campsite-interact", "clipId": "campsite-plan", "t": 200},
        {"segment": "segment-4-campsite-interact", "clipId": "campsite-steps", "t": 4000},
        {"segment": "segment-4-campsite-interact", "clipId": "campsite-done", "t": 34000},
    ]
    timing_path = CAST_DIR / "timing.json"
    with open(timing_path, "w") as f:
        json.dump(timing, f, indent=2)
    print(f"  Timing: {timing_path}")

    print(f"\nAll segments written to {CAST_DIR}/")
    print("Preview with: asciinema play <file>.cast")
