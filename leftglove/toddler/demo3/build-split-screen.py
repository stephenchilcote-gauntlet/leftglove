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
# (identity mappings where the log label == sieve key)
SIEVE_LABEL_MAP = {
    'ebay-search':      'ebay-search',
    'ebay-product-1':   'ebay-product-1',
    'ebay-product-2':   'ebay-product-2',
    'ebay-product-3':   'ebay-product-3',
    'ebay-done':        'ebay-done',
    'rc-home':          'rc-home',
    'rc-dropdown':      'rc-dropdown',
    'rc-date-page':     'rc-date-page',
    'rc-calendar':      'rc-calendar',
    'rc-departure-cal': 'rc-departure-cal',
    'rc-site-type':     'rc-site-type',
    'rc-results':       'rc-results',
    'rc-park':          'rc-park',
    'rc-campground':    'rc-campground',
    'rc-site-detail':   'rc-site-detail',
    'rc-login-wall':    'rc-login-wall',
}

BASE = os.path.dirname(os.path.abspath(__file__))
CAST_DIR = os.path.join(BASE, "casts")
SEGMENTS_DIR = os.path.join(BASE, "segments")
SCREENSHOTS_DIR = os.path.join(BASE, "screenshots")
os.makedirs(CAST_DIR, exist_ok=True)
os.makedirs(SEGMENTS_DIR, exist_ok=True)

# Extra dwell at end of workflow
END_DWELL = 3.0

# ANSI color codes for the MCP trace
C_RESET      = "\033[0m"
C_BOLD       = "\033[1m"
C_DIM        = "\033[2m"
C_GREEN      = "\033[32m"
C_YELLOW     = "\033[33m"
C_CYAN       = "\033[36m"
C_MAGENTA    = "\033[35m"
C_WHITE      = "\033[37m"
C_BOLD_GREEN = "\033[1;32m"
C_BOLD_CYAN  = "\033[1;36m"
C_BOLD_YELLOW = "\033[1;33m"

# Terminal color per sieve category (matches overlay box colors visually)
CATEGORY_COLORS = {
    'clickable':  C_GREEN,
    'typable':    C_CYAN,
    'readable':   C_YELLOW,
    'selectable': C_MAGENTA,
    'custom':     C_WHITE,
}


def load_log():
    with open(os.path.join(BASE, "workflow-log.json")) as f:
        return json.load(f)


def get_sieve_elements(sieve_key, sieves_data):
    """Return (index, element) pairs for non-chrome elements in a sieve state."""
    if not sieves_data or sieve_key not in sieves_data:
        return []
    all_els = sieves_data[sieve_key]['elements']
    return [(i, e) for i, e in enumerate(all_els) if e.get('category') != 'chrome']


def find_selection(sieve_elements, next_url):
    """Return the element index whose href contains next_url, or None."""
    if not next_url:
        return None
    for idx, el in sieve_elements:
        href = (el.get('locators') or {}).get('href', '')
        if href and next_url in href:
            return idx
    return None


def build_cast(entries, cast_path, title_line=None, sieves_data=None):
    """Build a .cast file from workflow log entries.

    For observe calls: shows the full element list (non-chrome) at end_t,
    then emits a selection highlight if the next navigate URL matches an element.
    For click/fill: shows the element label inline.
    """
    t0 = entries[0]["t"]

    header = {
        "version": 2,
        "width": 80,
        "height": 40,
        "timestamp": 0,
        "env": {"TERM": "xterm-256color"}
    }

    events = []

    if title_line:
        events.append([0.0, "o", f"{C_BOLD}{title_line}{C_RESET}\r\n"])
        events.append([0.0, "o", f"{C_DIM}{'─' * 60}{C_RESET}\r\n\r\n"])

    current_sieve_elements = []  # list of (idx, el) for non-chrome elements

    for i, entry in enumerate(entries):
        t     = entry["t"]     - t0
        end_t = entry.get("end_t", entry["t"]) - t0
        tool  = entry["tool"]
        label = entry["label"]
        prompt = f"{C_DIM}${C_RESET} "

        if tool == "observe":
            sieve_key = SIEVE_LABEL_MAP.get(label, label)
            current_sieve_elements = get_sieve_elements(sieve_key, sieves_data)

            url = entry.get("navigate", {}).get("url", "")
            if url:
                short = url[:50] + "..." if len(url) > 50 else url
                call = f"{C_BOLD_CYAN}observe{C_RESET}({C_DIM}{short}{C_RESET})"
            else:
                call = f"{C_BOLD_CYAN}observe{C_RESET}()"
            events.append([t, "o", prompt + call + "\r\n"])

            # Element list appears when sieve completes (end_t)
            if current_sieve_elements:
                n = len(current_sieve_elements)
                events.append([end_t, "o", f"  {C_GREEN}→ {n} elements:{C_RESET}\r\n"])
                for idx, el in current_sieve_elements:
                    cat = el.get("category", "")
                    lbl = (el.get("label") or "")[:38]
                    cat_c = CATEGORY_COLORS.get(cat, C_DIM)
                    events.append([end_t, "o",
                        f"    {C_DIM}[{idx:3d}]{C_RESET} "
                        f"{cat_c}{lbl:<38s}{C_RESET} "
                        f"{C_DIM}{cat}{C_RESET}\r\n"])
            else:
                n_el = entry.get("sieve", {}).get("element_count", "?")
                events.append([end_t, "o", f"  {C_GREEN}→ {n_el} elements{C_RESET}\r\n"])

            # Selection highlight: if the next entry navigates to a URL that
            # matches one of our sieve elements, call it out 0.5s after the list.
            if i + 1 < len(entries) and current_sieve_elements:
                next_url = entries[i + 1].get("navigate", {}).get("url", "")
                sel_idx = find_selection(current_sieve_elements, next_url)
                if sel_idx is not None:
                    sel_lbl = next(
                        (el.get("label", f"element {sel_idx}")
                         for eidx, el in current_sieve_elements if eidx == sel_idx),
                        f"element {sel_idx}"
                    )
                    events.append([end_t + 0.5, "o",
                        f"\r\n  {C_BOLD_GREEN}▶ {sel_lbl}{C_RESET}\r\n\r\n"])

        elif tool == "click":
            idx = entry.get("index")
            lbl = next(
                (el.get("label", "") for eidx, el in current_sieve_elements if eidx == idx),
                ""
            )
            call = f"{C_BOLD_YELLOW}click{C_RESET}(index={idx})"
            if lbl:
                call += f"  {C_DIM}# {lbl}{C_RESET}"
            events.append([t, "o", prompt + call + "\r\n"])
            events.append([end_t + 0.1, "o", "\r\n"])

        elif tool == "fill":
            idx  = entry.get("index")
            text = entry.get("text", "")
            lbl  = next(
                (el.get("label", "") for eidx, el in current_sieve_elements if eidx == idx),
                ""
            )
            call = f"{C_BOLD_YELLOW}fill{C_RESET}(index={idx}, {C_WHITE}\"{text}\"{C_RESET})"
            if lbl:
                call += f"  {C_DIM}# {lbl}{C_RESET}"
            events.append([t, "o", prompt + call + "\r\n"])
            events.append([end_t + 0.1, "o", "\r\n"])

        elif tool == "extract":
            product = entry.get("product", "")[:40]
            price   = entry.get("price", "")
            events.append([t, "o",
                f"  {C_MAGENTA}→ {product}: {C_BOLD}{price}{C_RESET}\r\n\r\n"])

    duration = (entries[-1].get("end_t", entries[-1]["t"]) - t0) + END_DWELL

    with open(cast_path, "w") as f:
        f.write(json.dumps(header) + "\n")
        for ev in events:
            f.write(json.dumps(ev) + "\n")

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

    Event types:
      - 'sieve':     fires at end_t of each observe; activates element boxes
      - 'sieve-out': begins fading the overlay out; subsequent sieve events ignored
      - 'click':     highlights one element; fires at click/fill t, or 0.5s after
                     a URL-match selection (the "▶ ElementName" terminal moment)
    """
    events = []
    sieves = {}
    current_sieve_key = None

    for i, entry in enumerate(entries):
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

                # Selection flash: same timing as the terminal "▶ ElementName" line
                if i + 1 < len(entries):
                    next_url = entries[i + 1].get('navigate', {}).get('url', '')
                    sieve_els = get_sieve_elements(sieve_key, sieves_data)
                    sel_idx = find_selection(sieve_els, next_url)
                    if sel_idx is not None:
                        events.append({
                            'type': 'click',
                            't': round(entry['end_t'] - t0 + 0.5, 4),
                            'sieve_label': sieve_key,
                            'index': sel_idx,
                        })
                        # Fade out: fire sieve-out right after the flash so
                        # subsequent sieve events (product pages) are ignored.
                        # Duration is chosen so the overlay reaches 0 at
                        # next_page_end + 2s (roughly 00:57 in the final video).
                        if i + 1 < len(entries):
                            next_end     = entries[i + 1].get('end_t', entries[i + 1]['t'])
                            out_start    = round(entry['end_t'] - t0 + 0.6, 4)
                            out_end      = round(next_end - t0 + 2.0, 4)
                            out_duration = round(out_end - out_start, 4)
                            events.append({
                                'type':     'sieve-out',
                                't':        out_start,
                                'duration': out_duration,
                            })

        elif tool in ('click', 'fill') and current_sieve_key:
            idx = entry.get('index')
            if idx is not None:
                t     = round(entry['t'] - t0, 4)
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
    rc_entries   = [e for e in log if e["label"].startswith("rc")]

    if args.workflow in ("ebay", "both"):
        print("\n=== eBay Split-Screen ===")
        cast_path   = os.path.join(CAST_DIR, "ebay-workflow.cast")
        output_path = os.path.join(SEGMENTS_DIR, "ebay-split.mp4")
        duration    = build_cast(ebay_entries, cast_path,
                                 title_line="eBay: Competitor Pricing Research",
                                 sieves_data=sieves_data)
        page_args    = build_page_image_args(ebay_entries)
        t0           = ebay_entries[0]["t"]
        overlay_path = os.path.join(BASE, "overlay-ebay.json")
        if sieves_data:
            build_overlay_json(ebay_entries, sieves_data, t0, overlay_path)
        run_cast_to_mp4(cast_path, output_path, page_args, duration,
                        overlay_data_path=overlay_path if sieves_data else None)

    if args.workflow in ("rc", "both"):
        print("\n=== ReserveCalifornia Split-Screen ===")
        cast_path   = os.path.join(CAST_DIR, "rc-workflow.cast")
        output_path = os.path.join(SEGMENTS_DIR, "rc-split.mp4")
        duration    = build_cast(rc_entries, cast_path,
                                 title_line="ReserveCalifornia: Book a Campsite",
                                 sieves_data=sieves_data)
        page_args    = build_page_image_args(rc_entries)
        t0           = rc_entries[0]["t"]
        overlay_path = os.path.join(BASE, "overlay-rc.json")
        if sieves_data:
            build_overlay_json(rc_entries, sieves_data, t0, overlay_path)
        run_cast_to_mp4(cast_path, output_path, page_args, duration,
                        overlay_data_path=overlay_path if sieves_data else None)

    print("\nDone!")


if __name__ == "__main__":
    main()
