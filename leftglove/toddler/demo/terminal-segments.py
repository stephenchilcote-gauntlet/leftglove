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


def blank_line(events: list, t: float) -> float:
    events.append((t, "o", "\r\n"))
    return t + 0.05


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 4 — Act 2: MCP Vocabulary (~30s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_mcp_vocabulary():
    events = []
    t = 0.5

    # Title
    events.append((t, "o", "\x1b[1;36m── MCP Tool Surface ──\x1b[0m\r\n"))
    t += 0.5

    t = type_command(events, t, "echo '{\"method\":\"tools/list\"}' | node dist/index.js | jq '.tools[].name'")
    t = show_output(events, t, [
        '\x1b[33m"observe"\x1b[0m',
        '\x1b[33m"list_vocabulary"\x1b[0m',
        '\x1b[33m"act"\x1b[0m',
        '\x1b[33m"refresh_vocabulary"\x1b[0m',
    ])
    t += BLOCK_PAUSE

    t = type_command(events, t, "echo '{\"method\":\"tools/call\",\"params\":{\"name\":\"list_vocabulary\"}}' | node dist/index.js | jq '.content[0].text' -r")
    t = show_output(events, t, [
        '\x1b[1mIntent: Login\x1b[0m',
        '  \x1b[32m✓\x1b[0m email       \x1b[90m(typable)  [data-testid="login-email"]\x1b[0m    verbs: fill',
        '  \x1b[32m✓\x1b[0m password    \x1b[90m(typable)  [data-testid="login-password"]\x1b[0m verbs: fill',
        '  \x1b[32m✓\x1b[0m submit      \x1b[90m(clickable) [data-testid="login-submit"]\x1b[0m  verbs: click',
        '  \x1b[32m✓\x1b[0m forgot-pw   \x1b[90m(clickable) [data-testid="forgot-password"]\x1b[0m verbs: click',
        '  \x1b[32m✓\x1b[0m heading     \x1b[90m(readable)  h1\x1b[0m                             verbs: see',
    ])
    t += BLOCK_PAUSE

    # Show strict mode rejection
    t = type_command(events, t, "echo '{\"method\":\"tools/call\",\"params\":{\"name\":\"act\",\"arguments\":{\"verb\":\"click\",\"intent\":\"Login\",\"element\":\"nonexistent\"}}}' | node dist/index.js")
    t = show_output(events, t, [
        '\x1b[31m✗ Error: unknown object "Login.nonexistent" (strict mode)\x1b[0m',
        '\x1b[90m  Available elements: email, password, submit, forgot-pw, heading\x1b[0m',
    ])
    t += BLOCK_PAUSE

    return write_cast("segment-4-mcp-vocabulary.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 5 — Act 3b: Agent Code Change (~15s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_code_change():
    events = []
    t = 0.5

    events.append((t, "o", "\x1b[1;36m── Agent adds Remember Me checkbox ──\x1b[0m\r\n"))
    t += 0.5

    t = type_command(events, t, "git diff leftglove/demo-app/views/login.ejs")
    t = show_output(events, t, [
        '\x1b[1mdiff --git a/leftglove/demo-app/views/login.ejs b/leftglove/demo-app/views/login.ejs\x1b[0m',
        '\x1b[36m@@ -12,6 +12,9 @@\x1b[0m',
        '         <input type="password" id="password" data-testid="login-password">',
        '       </div>',
        ' ',
        '\x1b[32m+      <div class="form-group">\x1b[0m',
        '\x1b[32m+        <label><input type="checkbox" id="remember-me" data-testid="login-remember-me"> Remember Me</label>\x1b[0m',
        '\x1b[32m+      </div>\x1b[0m',
        ' ',
        '       <button type="submit" data-testid="login-submit">Sign In</button>',
        '     </form>',
    ])
    t += BLOCK_PAUSE

    return write_cast("segment-5-code-change.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 6 — Act 4: Test Passes (~30s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_test_passes():
    events = []
    t = 0.5

    events.append((t, "o", "\x1b[1;36m── Agent writes test, SL runs it ──\x1b[0m\r\n"))
    t += 0.5

    t = type_command(events, t, "cat features/remember-me.feature")
    t = show_output(events, t, [
        '\x1b[35mFeature:\x1b[0m Remember Me checkbox',
        '',
        '  \x1b[35mScenario:\x1b[0m Remember Me checkbox exists and is clickable',
        '    \x1b[36mGiven\x1b[0m :user/alice navigates to the login page',
        '    \x1b[36mWhen\x1b[0m  :user/alice clicks \x1b[1mLogin.remember-me\x1b[0m',
        '    \x1b[36mAnd\x1b[0m   :user/alice fills \x1b[1mLogin.email\x1b[0m with "alice@example.com"',
        '    \x1b[36mAnd\x1b[0m   :user/alice fills \x1b[1mLogin.password\x1b[0m with "password123"',
        '    \x1b[36mAnd\x1b[0m   :user/alice clicks \x1b[1mLogin.submit\x1b[0m',
        '    \x1b[36mThen\x1b[0m  :user/alice should see \x1b[1mDashboard.heading\x1b[0m',
    ])
    t += BLOCK_PAUSE

    t = type_command(events, t, "sl run features/remember-me.feature")
    t = show_output(events, t, [
        '\x1b[90m[sl] Loading glossary from sl-project/glossary/...\x1b[0m',
        '\x1b[90m[sl] Validating feature against glossary (strict mode)...\x1b[0m',
        '\x1b[90m[sl] All objects validated ✓\x1b[0m',
        '\x1b[90m[sl] Running: Remember Me checkbox exists and is clickable\x1b[0m',
        '',
        '  \x1b[32m✓\x1b[0m Given :user/alice navigates to the login page',
        '  \x1b[32m✓\x1b[0m When  :user/alice clicks Login.remember-me',
        '  \x1b[32m✓\x1b[0m And   :user/alice fills Login.email with "alice@example.com"',
        '  \x1b[32m✓\x1b[0m And   :user/alice fills Login.password with "password123"',
        '  \x1b[32m✓\x1b[0m And   :user/alice clicks Login.submit',
        '  \x1b[32m✓\x1b[0m Then  :user/alice should see Dashboard.heading',
        '',
        '\x1b[32m1 scenario (1 passed)\x1b[0m',
        '\x1b[32m6 steps (6 passed)\x1b[0m',
        '\x1b[90m0m4.2s\x1b[0m',
    ])
    t += BLOCK_PAUSE

    return write_cast("segment-6-test-passes.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT 7 — Act 5b: Test Fails (~20s)
# ═══════════════════════════════════════════════════════════════════════════════

def segment_test_fails():
    events = []
    t = 0.5

    events.append((t, "o", "\x1b[1;36m── Checkbox removed — test catches the drift ──\x1b[0m\r\n"))
    t += 0.5

    t = type_command(events, t, "sl run features/remember-me.feature")
    t = show_output(events, t, [
        '\x1b[90m[sl] Loading glossary from sl-project/glossary/...\x1b[0m',
        '\x1b[90m[sl] Validating feature against glossary (strict mode)...\x1b[0m',
        '',
        '\x1b[31;1m✗ Validation failed:\x1b[0m',
        '\x1b[31m  Login.remember-me: unknown object (strict mode)\x1b[0m',
        '',
        '\x1b[90m  The glossary has no element "remember-me" in intent "Login".\x1b[0m',
        '\x1b[90m  Available elements: email, password, submit, forgot-pw, heading\x1b[0m',
        '',
        '\x1b[31m0 scenarios\x1b[0m',
        '\x1b[31m0 steps (glossary validation failed)\x1b[0m',
        '\x1b[90m0m0.1s\x1b[0m',
    ])
    t += BLOCK_PAUSE * 2

    return write_cast("segment-7-test-fails.cast", events)


# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Generating terminal segments...")
    segment_mcp_vocabulary()
    segment_code_change()
    segment_test_passes()
    segment_test_fails()
    print(f"\nAll segments written to {CAST_DIR}/")
    print("Preview with: asciinema play <file>.cast")
