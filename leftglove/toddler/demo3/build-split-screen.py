#!/usr/bin/env python3
"""Build split-screen videos from workflow recordings.

Reads workflow-log.json and screenshots/ to produce:
  - A synthetic asciinema .cast file showing the MCP trace (right pane)
  - Page image timeline args for cast-to-mp4.py (left pane)
  - Final split-screen MP4 for each workflow segment

Usage:
    python3 build-split-screen.py [--workflow ebay|rc|both]
"""

import json
import os
import sys

# Maps workflow-log observe labels → workflow-sieves.json keys
SIEVE_LABEL_MAP = {
    'ebay-search':    'ebay-search',
    'ebay-product-1': 'ebay-product-1',
    'ebay-product-2': 'ebay-product-2',
    'ebay-product-3': 'ebay-product-3',
    'ebay-done':      'ebay-search-done',
    'rc-home':        'rc-home',
    'rc-dropdown':    'rc-search-dropdown',
    'rc-date-page':   'rc-date-picker',
    'rc-calendar':    'rc-calendar',
    'rc-site-type':   'rc-site-type',
    'rc-results':     'rc-results',
    'rc-park':        'rc-park-page',
    'rc-campground':  'rc-facility',
    'rc-site-detail': 'rc-site-selected',
    'rc-login-wall':  'rc-login-wall',
}

BASE = os.path.dirname(os.path.abspath(__file__))
CAST_DIR = os.path.join(BASE, "casts")
SEGMENTS_DIR = os.path.join(BASE, "segments")
SCREENSHOTS_DIR = os.path.join(BASE, "screenshots")
os.makedirs(CAST_DIR, exist_ok=True)
os.makedirs(SEGMENTS_DIR, exist_ok=True)

# Time each step is visible before the next one appears (seconds)
STEP_DWELL = 2.0
# Extra dwell at end of workflow
END_DWELL = 3.0

# ANSI color codes for the MCP trace
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_DIM = "\033[2m"
C_GREEN = "\033[32m"
C_YELLOW = "\033[33m"
C_CYAN = "\033[36m"
C_MAGENTA = "\033[35m"
C_WHITE = "\033[37m"
C_BOLD_GREEN = "\033[1;32m"
C_BOLD_CYAN = "\033[1;36m"
C_BOLD_YELLOW = "\033[1;33m"


def load_log():
    with open(os.path.join(BASE, "workflow-log.json")) as f:
        return json.load(f)


def format_trace_line(entry):
    """Format a workflow log entry as colored terminal text."""
    tool = entry["tool"]
    label = entry["label"]
    step = entry["step"]

    if tool == "observe":
        url = entry.get("navigate", {}).get("url", "")
        sieve = entry.get("sieve", {})
        n_elements = sieve.get("element_count", "?")
        if url:
            short_url = url[:55] + "..." if len(url) > 55 else url
            line = f"{C_BOLD_CYAN}observe{C_RESET}({C_DIM}{short_url}{C_RESET})"
        else:
            line = f"{C_BOLD_CYAN}observe{C_RESET}()"
        result = f"  {C_GREEN}\u2192 {n_elements} elements{C_RESET}"
        return line, result

    elif tool == "click":
        idx = entry.get("index", "?")
        line = f"{C_BOLD_YELLOW}click{C_RESET}(index={idx})"
        return line, None

    elif tool == "fill":
        idx = entry.get("index", "?")
        text = entry.get("text", "")
        line = f"{C_BOLD_YELLOW}fill{C_RESET}(index={idx}, {C_WHITE}\"{text}\"{C_RESET})"
        return line, None

    elif tool == "extract":
        product = entry.get("product", "")[:40]
        price = entry.get("price", "")
        line = f"  {C_MAGENTA}\u2192 {product}: {C_BOLD}{price}{C_RESET}"
        return line, None

    return f"{tool}({label})", None


def build_cast(entries, cast_path, title_line=None):
    """Build a .cast file from workflow log entries.

    Each entry appears at its recorded timestamp, with the trace text
    typed out character-by-character for visual effect.
    """
    # Compute time base: offset so first entry starts at t=0
    t0 = entries[0]["t"]

    # Cast header
    header = {
        "version": 2,
        "width": 80,
        "height": 35,
        "timestamp": 0,
        "env": {"TERM": "xterm-256color"}
    }

    events = []

    # Title line at t=0
    if title_line:
        events.append([0.0, "o", f"{C_BOLD}{title_line}{C_RESET}\r\n"])
        events.append([0.0, "o", f"{C_DIM}{'─' * 60}{C_RESET}\r\n\r\n"])

    for entry in entries:
        t = entry["t"] - t0
        line, result = format_trace_line(entry)

        # Type the command prompt + line
        prompt = f"{C_DIM}${C_RESET} "
        events.append([t, "o", prompt + line + "\r\n"])

        # Show result line shortly after
        if result:
            events.append([t + 0.3, "o", result + "\r\n"])

        events.append([t + 0.5, "o", "\r\n"])

    # Write cast file
    with open(cast_path, "w") as f:
        f.write(json.dumps(header) + "\n")
        for ev in events:
            f.write(json.dumps(ev) + "\n")

    duration = (entries[-1].get("end_t", entries[-1]["t"]) - t0) + END_DWELL
    print(f"  Cast: {cast_path} ({len(events)} events, {duration:.1f}s)")
    return duration


def build_page_image_args(entries):
    """Build --page-images args for cast-to-mp4.py from workflow entries."""
    t0 = entries[0]["t"]
    args = []
    for entry in entries:
        screenshot = entry.get("screenshot")
        if screenshot and os.path.exists(screenshot):
            t = entry.get("end_t", entry["t"]) - t0
            args.append(f"{t:.1f}:{screenshot}")
    return args


def build_overlay_json(entries, sieves_data, t0, out_path):
    """Generate overlay-events JSON for cast-to-mp4.py --overlay-data.

    Two event types:
      - 'sieve': fires at end_t of each observe; fades in all element boxes
      - 'click': fires at t of each click/fill; highlights the specific element
    """
    events  = []
    sieves  = {}

    # Track the current sieve label so click events can reference it
    current_sieve_key = None

    for entry in entries:
        tool  = entry.get('tool')
        label = entry['label']

        if tool == 'observe':
            sieve_key = SIEVE_LABEL_MAP.get(label, label)
            if sieve_key in sieves_data:
                t = round(entry['end_t'] - t0, 4)
                events.append({'type': 'sieve', 't': t, 'label': sieve_key})
                current_sieve_key = sieve_key
                if sieve_key not in sieves:
                    sd = sieves_data[sieve_key]
                    sieves[sieve_key] = {
                        'elements': sd['elements'],
                        'viewport': sd['viewport'],
                    }

        elif tool in ('click', 'fill') and current_sieve_key:
            idx = entry.get('index')
            if idx is not None:
                t = round(entry['t'] - t0, 4)
                # Verify index is within bounds for current sieve
                n_els = len(sieves.get(current_sieve_key, {}).get('elements', []))
                if idx < n_els:
                    events.append({
                        'type': 'click',
                        't': t,
                        'sieve_label': current_sieve_key,
                        'index': idx,
                    })

    events.sort(key=lambda e: e['t'])
    with open(out_path, 'w') as f:
        json.dump({'events': events, 'sieves': sieves}, f)
    n_sieve  = sum(1 for e in events if e['type'] == 'sieve')
    n_clicks = sum(1 for e in events if e['type'] == 'click')
    print(f"  Overlay data: {n_sieve} observe + {n_clicks} click events → {out_path}")
    return out_path


def run_cast_to_mp4(cast_path, output_path, page_image_args, duration, overlay_data_path=None):
    """Run cast-to-mp4.py to produce the split-screen video."""
    import subprocess

    cast_to_mp4 = os.path.join(BASE, "..", "demo", "cast-to-mp4.py")
    if not os.path.exists(cast_to_mp4):
        cast_to_mp4 = os.path.join(BASE, "..", "demo2", "cast-to-mp4.py")

    cmd = [
        sys.executable, cast_to_mp4,
        cast_path, output_path,
        "--fps", "30",
        "--width", "1920",
        "--height", "1080",
    ]

    if page_image_args:
        cmd.append("--page-images")
        cmd.extend(page_image_args)

    if overlay_data_path and os.path.exists(overlay_data_path):
        cmd.extend(["--overlay-data", overlay_data_path])

    print(f"  Running: {' '.join(cmd[:6])} ... ({len(page_image_args)} page images"
          f"{', overlay' if overlay_data_path else ''})")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[-500:]}")
        return False
    print(result.stdout)
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow", default="both", choices=["ebay", "rc", "both"])
    args = parser.parse_args()

    log = load_log()

    # Load sieve element data
    sieves_path = os.path.join(BASE, "workflow-sieves.json")
    sieves_data = {}
    if os.path.exists(sieves_path):
        with open(sieves_path) as f:
            sieves_data = json.load(f)
        print(f"Loaded sieve data for {len(sieves_data)} page states")
    else:
        print("WARNING: workflow-sieves.json not found — no overlay")

    # Split log into workflows
    ebay_entries = [e for e in log if e["label"].startswith("ebay") or e["label"] == "extract-price"]
    rc_entries = [e for e in log if e["label"].startswith("rc")]

    if args.workflow in ("ebay", "both"):
        print("\n=== eBay Split-Screen ===")
        cast_path = os.path.join(CAST_DIR, "ebay-workflow.cast")
        output_path = os.path.join(SEGMENTS_DIR, "ebay-split.mp4")
        duration = build_cast(ebay_entries, cast_path, title_line="eBay: Competitor Pricing Research")
        page_args = build_page_image_args(ebay_entries)
        t0 = ebay_entries[0]["t"]
        overlay_path = os.path.join(BASE, "overlay-ebay.json")
        if sieves_data:
            build_overlay_json(ebay_entries, sieves_data, t0, overlay_path)
        run_cast_to_mp4(cast_path, output_path, page_args, duration,
                        overlay_data_path=overlay_path if sieves_data else None)

    if args.workflow in ("rc", "both"):
        print("\n=== ReserveCalifornia Split-Screen ===")
        cast_path = os.path.join(CAST_DIR, "rc-workflow.cast")
        output_path = os.path.join(SEGMENTS_DIR, "rc-split.mp4")
        duration = build_cast(rc_entries, cast_path, title_line="ReserveCalifornia: Book a Campsite")
        page_args = build_page_image_args(rc_entries)
        t0 = rc_entries[0]["t"]
        overlay_path = os.path.join(BASE, "overlay-rc.json")
        if sieves_data:
            build_overlay_json(rc_entries, sieves_data, t0, overlay_path)
        run_cast_to_mp4(cast_path, output_path, page_args, duration,
                        overlay_data_path=overlay_path if sieves_data else None)

    print("\nDone!")


if __name__ == "__main__":
    main()
