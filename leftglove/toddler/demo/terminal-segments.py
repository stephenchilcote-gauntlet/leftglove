#!/usr/bin/env python3
"""
Generate asciinema .cast files for terminal demo segments.

Each segment is a scripted terminal session showing pre-defined commands
and output. The .cast files can be converted to video via agg or replayed
with asciinema play.

Output: demo/casts/segment-*.cast
"""

import json
import os
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
    # Show prompt
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
    """Add a no-op event to hold the terminal display for `secs` seconds."""
    t += secs
    events.append((t, "o", ""))  # empty event to extend duration
    return t


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 4 — Act 2: MCP Vocabulary (~30s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_mcp_vocabulary():
    events = []
    t = 0.0

    # Title
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
        '\x1b[1mIntent: Fundraiser\x1b[0m',
        '  \x1b[32m✓\x1b[0m title               \x1b[90m(readable)   [data-testid="fundraiser-title"]\x1b[0m     verbs: see',
        '  \x1b[32m✓\x1b[0m donate-button       \x1b[90m(clickable)  [data-testid="donate-button"]\x1b[0m        verbs: click',
        '  \x1b[32m✓\x1b[0m amount-input        \x1b[90m(typable)    [data-testid="amount-input"]\x1b[0m         verbs: fill',
        '  \x1b[32m✓\x1b[0m name-input          \x1b[90m(typable)    [data-testid="name-input"]\x1b[0m           verbs: fill',
        '  \x1b[32m✓\x1b[0m comment-input       \x1b[90m(typable)    [data-testid="comment-input"]\x1b[0m        verbs: fill',
        '  \x1b[32m✓\x1b[0m pledge-submit       \x1b[90m(clickable)  [data-testid="pledge-submit"]\x1b[0m        verbs: click',
        '  \x1b[32m✓\x1b[0m recurring-checkbox  \x1b[90m(clickable)  [data-testid="recurring-checkbox"]\x1b[0m   verbs: click',
        '  \x1b[32m✓\x1b[0m follow-button       \x1b[90m(clickable)  [data-testid="follow-button"]\x1b[0m        verbs: click',
        '  \x1b[32m✓\x1b[0m share-button        \x1b[90m(clickable)  [data-testid="share-button"]\x1b[0m         verbs: click',
    ])
    t += BLOCK_PAUSE

    t = hold(events, t, 2.0)  # Hold on vocabulary list so mcp-vocab narration can finish

    # Show glossary as strict-mode contract — agent validates references against it
    t = type_command(events, t, "echo 'Fundraiser.checkout' | sl validate --glossary")
    t = show_output(events, t, [
        '\x1b[31m✗ Error: unknown object "Fundraiser.checkout"\x1b[0m',
        '\x1b[90m  Available: title, donate-button, amount-input, name-input, comment-input,\x1b[0m',
        '\x1b[90m            pledge-submit, recurring-checkbox, follow-button, share-button\x1b[0m',
    ])
    t = hold(events, t, 5.0)  # Hold on error so strict-mode narration can finish

    return write_cast("segment-4-mcp-vocabulary.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 5 — Act 3b: Agent Code Change (~15s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_code_change():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── Agent adds recurring donation toggle ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "git diff leftglove/demo-app/views/fundraiser.ejs")
    t = show_output(events, t, [
        '\x1b[1mdiff --git a/leftglove/demo-app/views/fundraiser.ejs b/leftglove/demo-app/views/fundraiser.ejs\x1b[0m',
        '\x1b[36m@@ -108,6 +108,14 @@\x1b[0m',
        '           </div>',
        ' ',
        '\x1b[32m+          <!-- Recurring donation toggle -->\x1b[0m',
        '\x1b[32m+          <div class="rounded-xl bg-green-soft p-4" data-testid="recurring-donation">\x1b[0m',
        '\x1b[32m+            <label class="flex items-center gap-3 cursor-pointer">\x1b[0m',
        '\x1b[32m+              <input type="checkbox" data-testid="recurring-checkbox" />\x1b[0m',
        '\x1b[32m+              <span class="text-sm font-medium">Make it monthly</span>\x1b[0m',
        '\x1b[32m+            </label>\x1b[0m',
        '\x1b[32m+          </div>\x1b[0m',
        ' ',
        '           <hr class="border-gray-200" />',
    ])
    t = hold(events, t, 5.0)  # Hold on diff so narration can finish

    return write_cast("segment-5-code-change.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 6 — Act 4: Test Passes (~30s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_test_passes():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── Agent writes test, SL runs it ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "cat features/recurring-donation.feature")
    t = show_output(events, t, [
        '\x1b[35mFeature:\x1b[0m Recurring donation option',
        '',
        '  \x1b[35mScenario:\x1b[0m Donor can enable monthly recurring donation',
        '    \x1b[36mGiven\x1b[0m :user/alice navigates to the fundraiser page',
        '    \x1b[36mWhen\x1b[0m  :user/alice clicks \x1b[1mFundraiser.donate-button\x1b[0m',
        '    \x1b[36mAnd\x1b[0m   :user/alice clicks \x1b[1mFundraiser.recurring-checkbox\x1b[0m',
        '    \x1b[36mAnd\x1b[0m   :user/alice fills \x1b[1mFundraiser.amount-input\x1b[0m with "25"',
        '    \x1b[36mAnd\x1b[0m   :user/alice fills \x1b[1mFundraiser.name-input\x1b[0m with "Alice"',
        '    \x1b[36mAnd\x1b[0m   :user/alice clicks \x1b[1mFundraiser.pledge-submit\x1b[0m',
        '    \x1b[36mThen\x1b[0m  :user/alice should see \x1b[1mFundraiser.title\x1b[0m',
    ])
    t += BLOCK_PAUSE

    t = hold(events, t, 6.0)  # Hold on test source so test-write narration can play

    t = type_command(events, t, "sl run features/recurring-donation.feature")
    t = show_output(events, t, [
        '\x1b[90m[sl] Loading glossary from sl-project/glossary/...\x1b[0m',
        '\x1b[90m[sl] Validating feature against glossary (strict mode)...\x1b[0m',
        '\x1b[90m[sl] All objects validated ✓\x1b[0m',
        '\x1b[90m[sl] Running: Donor can enable monthly recurring donation\x1b[0m',
        '',
        '  \x1b[32m✓\x1b[0m Given :user/alice navigates to the fundraiser page',
        '  \x1b[32m✓\x1b[0m When  :user/alice clicks Fundraiser.donate-button',
        '  \x1b[32m✓\x1b[0m And   :user/alice clicks Fundraiser.recurring-checkbox',
        '  \x1b[32m✓\x1b[0m And   :user/alice fills Fundraiser.amount-input with "25"',
        '  \x1b[32m✓\x1b[0m And   :user/alice fills Fundraiser.name-input with "Alice"',
        '  \x1b[32m✓\x1b[0m And   :user/alice clicks Fundraiser.pledge-submit',
        '  \x1b[32m✓\x1b[0m Then  :user/alice should see Fundraiser.title',
        '',
        '\x1b[32m1 scenario (1 passed)\x1b[0m',
        '\x1b[32m7 steps (7 passed)\x1b[0m',
        '\x1b[90m0m3.8s\x1b[0m',
    ])
    t = hold(events, t, 4.0)  # Hold on pass result so test-pass narration can play

    return write_cast("segment-6-test-passes.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 7 — Act 5b: Test Fails (~20s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_test_fails():
    events = []
    t = 0.0

    events.append((t, "o", "\x1b[1;36m── Recurring toggle removed — test catches the drift ──\x1b[0m\r\n"))
    t += 0.8

    t = type_command(events, t, "sl run features/recurring-donation.feature")
    t = show_output(events, t, [
        '\x1b[90m[sl] Loading glossary from sl-project/glossary/...\x1b[0m',
        '\x1b[90m[sl] Validating feature against glossary (strict mode)...\x1b[0m',
        '',
        '\x1b[31;1m✗ Validation failed:\x1b[0m',
        '\x1b[31m  Fundraiser.recurring-checkbox: unknown object (strict mode)\x1b[0m',
        '',
        '\x1b[90m  The glossary has no element "recurring-checkbox" in intent "Fundraiser".\x1b[0m',
        '\x1b[90m  Available: title, donate-button, amount-input, name-input,\x1b[0m',
        '\x1b[90m            comment-input, pledge-submit, follow-button, share-button\x1b[0m',
        '',
        '\x1b[31m0 scenarios\x1b[0m',
        '\x1b[31m0 steps (glossary validation failed)\x1b[0m',
        '\x1b[90m0m0.1s\x1b[0m',
    ])
    t = hold(events, t, 9.0)  # Hold on failure output so narration can finish

    return write_cast("segment-7-test-fails.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Generating terminal segments...")
    segment_mcp_vocabulary()
    segment_code_change()
    segment_test_passes()
    segment_test_fails()

    # Write timing.json — maps narration clips to offsets within each segment.
    # assemble.sh adds each segment's global start offset to get final placement.
    timing = [
        # segment-4: MCP vocabulary (~25s)
        {"segment": "segment-4-mcp-vocabulary", "clipId": "mcp-vocab", "t": 200},
        {"segment": "segment-4-mcp-vocabulary", "clipId": "strict-mode", "t": 15000},
        # segment-5: code change (~8s)
        {"segment": "segment-5-code-change", "clipId": "code-change", "t": 200},
        # segment-6: test passes (~15s)
        {"segment": "segment-6-test-passes", "clipId": "test-write", "t": 200},
        {"segment": "segment-6-test-passes", "clipId": "test-pass", "t": 9500},
        # segment-7: test fails (~11s)
        {"segment": "segment-7-test-fails", "clipId": "test-fail", "t": 200},
    ]
    timing_path = CAST_DIR / "timing.json"
    with open(timing_path, "w") as f:
        json.dump(timing, f, indent=2)
    print(f"  Timing: {timing_path}")

    print(f"\nAll segments written to {CAST_DIR}/")
    print("Preview with: asciinema play <file>.cast")
