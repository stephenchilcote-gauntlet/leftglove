#!/usr/bin/env python3
"""
Convert asciinema .cast files to MP4 video.

Uses pyte (terminal emulator) to render frames and Pillow to produce images,
then ffmpeg to encode to video.

Usage: python3 cast-to-mp4.py input.cast output.mp4 [--fps 30] [--width 1920] [--height 1080]
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import pyte
except ImportError:
    sys.exit("pip install pyte")

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("pip install Pillow")


# Sieve element overlay — category colors matching overlay-inject.ts
SIEVE_COLORS = {
    'clickable':  (34,  197,  94),   # #22c55e green
    'typable':    (59,  130, 246),   # #3b82f6 blue
    'readable':   (234, 179,   8),   # #eab308 yellow
    'chrome':     (107, 114, 128),   # #6b7280 gray
    'custom':     (168,  85, 247),   # #a855f7 purple
    'selectable': (249, 115,  22),   # #f97316 orange
    'split':      (249, 115,  22),   # #f97316 orange
}
SIEVE_FILL_OPACITY  = 0.22   # semi-transparent fill (matches overlay-inject.ts)
SIEVE_FADE_DURATION = 0.6    # seconds for overlay to reach full opacity


def draw_sieve_overlay(page_img, elements, viewport_w, viewport_h, alpha,
                       highlight_el=None, hl_alpha=0.0):
    """Composite sieve element boxes onto page_img. Returns new RGB image.

    elements/alpha  — full sieve overlay, fading in after observe
    highlight_el    — single element to highlight on click (optional)
    hl_alpha        — bell-curve value (0→1→0) over the click duration

    Two-pass compositing: base overlay and highlight are drawn on SEPARATE
    canvases so Pillow's overwrite semantics can't erase base overlay pixels.
    """
    if (alpha <= 0 or not elements) and (hl_alpha <= 0 or not highlight_el):
        return page_img

    disp_w, disp_h = page_img.size
    scale  = min(disp_w / viewport_w, disp_h / viewport_h)
    new_w  = int(viewport_w * scale)
    new_h  = int(viewport_h * scale)
    off_x  = (disp_w - new_w) // 2
    off_y  = (disp_h - new_h) // 2

    def scaled_rect(r):
        ex, ey = r.get('x', 0), r.get('y', 0)
        ew, eh = r.get('w', 0), r.get('h', 0)
        if ew <= 0 or eh <= 0:
            return None
        return (off_x + int(ex * scale), off_y + int(ey * scale),
                max(1, int(ew * scale)), max(1, int(eh * scale)))

    result = page_img.convert('RGBA')

    # Pass 1: base sieve overlay on its own canvas (all non-chrome elements)
    if alpha > 0 and elements:
        base_canvas = Image.new('RGBA', (disp_w, disp_h), (0, 0, 0, 0))
        drw = ImageDraw.Draw(base_canvas)
        for el in elements:
            cat = el.get('category', 'custom')
            if cat in ('chrome', 'skip'):
                continue
            sr = scaled_rect(el.get('rect', {}))
            if not sr:
                continue
            sx, sy, sw, sh = sr
            rgb      = SIEVE_COLORS.get(cat, SIEVE_COLORS['custom'])
            fill_a   = int(alpha * SIEVE_FILL_OPACITY * 255)
            stroke_a = int(alpha * 255)
            drw.rectangle([sx, sy, sx + sw, sy + sh],
                          fill=(*rgb, fill_a),
                          outline=(*rgb, stroke_a),
                          width=2)
        result = Image.alpha_composite(result, base_canvas)

    # Pass 2: click highlight on a SEPARATE canvas — never overwrites Pass 1.
    # hl_alpha is a bell-curve value (0→1→0), already computed by caller.
    if hl_alpha > 0 and highlight_el:
        sr = scaled_rect(highlight_el.get('rect', {}))
        if sr:
            sx, sy, sw, sh = sr
            a   = hl_alpha
            cat = highlight_el.get('category', 'custom')
            rgb = SIEVE_COLORS.get(cat, SIEVE_COLORS['custom'])

            hl_canvas = Image.new('RGBA', (disp_w, disp_h), (0, 0, 0, 0))
            hl_drw = ImageDraw.Draw(hl_canvas)

            # Outer glow ring — slightly expanded box, soft fill
            PAD = 10
            hl_drw.rectangle([sx - PAD, sy - PAD, sx + sw + PAD, sy + sh + PAD],
                              fill=(*rgb, int(a * 0.18 * 255)),
                              outline=(*rgb, int(a * 0.55 * 255)),
                              width=2)

            # Element box redrawn bright — high fill + white outline
            hl_drw.rectangle([sx, sy, sx + sw, sy + sh],
                              fill=(*rgb, int(a * 0.60 * 255)),
                              outline=(255, 255, 255, int(a * 255)),
                              width=3)

            result = Image.alpha_composite(result, hl_canvas)

    return result.convert('RGB')


def get_overlay_state(frame_time, overlay_events, overlay_sieves):
    """Return overlay draw instructions for this frame.

    Returns (base_elements, vp_w, vp_h, base_alpha, highlight_el, hl_alpha)
      base_*      — the active sieve overlay
      highlight_* — a single element being clicked (bright flash, None if none)

    Event types:
      'sieve'     — activate overlay for a page (ignored once sieve-out fires)
      'sieve-out' — begin fading out; all subsequent sieve events are ignored
      'click'     — brief highlight flash on one element
    """
    CLICK_HIGHLIGHT_DUR = 2.5   # seconds for full bell-curve arc

    active_sieve  = None
    first_sieve_t = None   # time of the very first sieve event (for fade-in)
    sieve_out_t   = None   # time the fade-out began, or None
    sieve_out_dur = SIEVE_FADE_DURATION
    active_click  = None

    for ev in overlay_events:
        if ev['t'] > frame_time:
            break
        if ev['type'] == 'sieve':
            if first_sieve_t is None:
                first_sieve_t = ev['t']  # capture once for fade-in
            active_sieve = ev            # always update content on page change
        elif ev['type'] == 'sieve-out':
            sieve_out_t   = ev['t']
            sieve_out_dur = ev.get('duration', SIEVE_FADE_DURATION)
        elif ev['type'] == 'click':
            if frame_time - ev['t'] < CLICK_HIGHLIGHT_DUR:
                active_click = ev

    base_elements, vp_w, vp_h, base_alpha = None, 0, 0, 0.0
    if active_sieve:
        sieve = overlay_sieves.get(active_sieve['label'])
        if sieve:
            if sieve_out_t is not None:
                # Fading out
                elapsed    = frame_time - sieve_out_t
                base_alpha = max(0.0, 1.0 - elapsed / sieve_out_dur)
            else:
                # Fading in from the first sieve event
                base_alpha = min(1.0, (frame_time - first_sieve_t) / SIEVE_FADE_DURATION)
            if base_alpha > 0:
                vp = sieve['viewport']
                base_elements, vp_w, vp_h = sieve['elements'], vp['w'], vp['h']

    highlight_el, hl_alpha = None, 0.0
    if active_click:
        sieve = overlay_sieves.get(active_click['sieve_label'])
        if sieve:
            els = sieve['elements']
            idx = active_click['index']
            if idx < len(els):
                highlight_el = els[idx]
                elapsed  = frame_time - active_click['t']
                hl_alpha = math.sin(math.pi * elapsed / CLICK_HIGHLIGHT_DUR)
                vp = sieve['viewport']
                vp_w, vp_h = vp['w'], vp['h']

    return base_elements, vp_w, vp_h, base_alpha, highlight_el, hl_alpha


# Terminal color palette (dark theme matching TL UI)
COLORS = {
    "black":   (26,  26,  46),   # #1a1a2e
    "red":     (255, 85,  85),
    "green":   (80,  250, 123),
    "yellow":  (241, 250, 140),
    "blue":    (98,  114, 164),
    "magenta": (255, 121, 198),
    "cyan":    (0,   217, 255),
    "white":   (204, 232, 255),
    "default": (204, 232, 255),  # text color
}
BG_COLOR = (26, 26, 46)  # #1a1a2e — matches TL UI dark theme

# Bold variants
BOLD_COLORS = {
    "black":   (68,  68,  102),
    "red":     (255, 110, 110),
    "green":   (100, 255, 148),
    "yellow":  (255, 255, 170),
    "blue":    (130, 150, 200),
    "magenta": (255, 150, 220),
    "cyan":    (50,  230, 255),
    "white":   (255, 255, 255),
    "default": (255, 255, 255),
}


def get_color(name, bold=False):
    palette = BOLD_COLORS if bold else COLORS
    return palette.get(name, COLORS["default"])


def load_page_image(path, target_w, target_h):
    """Load a page image, scale to fit preserving aspect ratio, pad with BG_COLOR."""
    img = Image.open(path).convert("RGB")
    src_w, src_h = img.size
    scale = min(target_w / src_w, target_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    result = Image.new("RGB", (target_w, target_h), BG_COLOR)
    result.paste(resized, ((target_w - new_w) // 2, (target_h - new_h) // 2))
    return result


def render_frame(screen, width, height, font, char_w, char_h, pad_x, pad_y):
    """Render a pyte screen to a PIL Image."""
    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    for row in range(screen.lines):
        for col in range(screen.columns):
            char = screen.buffer[row][col]
            if char.data == " " and char.bg == "default":
                continue

            x = pad_x + col * char_w
            y = pad_y + row * char_h

            # Background
            if char.bg != "default":
                bg = get_color(char.bg)
                draw.rectangle([x, y, x + char_w, y + char_h], fill=bg)

            # Foreground
            if char.data and char.data != " ":
                fg = get_color(char.fg, bold=char.bold)
                draw.text((x, y), char.data, fill=fg, font=font)

    return img


def main():
    parser = argparse.ArgumentParser(description="Convert .cast to .mp4")
    parser.add_argument("input", help="Input .cast file")
    parser.add_argument("output", help="Output .mp4 file")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--page-image", help="Page screenshot for split-screen (left half)")
    parser.add_argument("--page-images", nargs="*",
                        help="Multiple page images with timestamps: 'time:path' (e.g. '0:before.png 3.5:after.png')")
    parser.add_argument("--overlay-data", help="JSON file with sieve overlay events")
    args = parser.parse_args()

    # Parse cast file
    with open(args.input) as f:
        lines = f.readlines()

    header = json.loads(lines[0])
    cols = header.get("width", 120)
    rows = header.get("height", 35)

    events = []
    for line in lines[1:]:
        ts, etype, data = json.loads(line)
        if etype == "o":
            events.append((ts, data))

    if not events:
        sys.exit("No output events in cast file")

    total_duration = events[-1][0] + 1.0
    total_frames = int(total_duration * args.fps)

    # Find a monospace font — auto-size to fit terminal in frame
    font_path_found = None
    for font_path in [
        "/usr/share/fonts/TTF/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
    ]:
        if Path(font_path).exists():
            font_path_found = font_path
            break

    # Start at preferred size 24, shrink if terminal doesn't fit in frame
    PAD_MARGIN = 40  # px padding on each side
    font_size = 24
    while font_size >= 10:
        if font_path_found:
            font = ImageFont.truetype(font_path_found, font_size)
        else:
            font = ImageFont.load_default()
            break
        bbox = font.getbbox("M")
        char_w = bbox[2] - bbox[0]
        char_h = int((bbox[3] - bbox[1]) * 1.4)
        term_w = cols * char_w
        term_h = rows * char_h
        if term_w <= args.width - PAD_MARGIN * 2 and term_h <= args.height - PAD_MARGIN * 2:
            break
        font_size -= 1

    if font_path_found is None:
        font = ImageFont.load_default()
        bbox = font.getbbox("M")
        char_w = bbox[2] - bbox[0]
        char_h = int((bbox[3] - bbox[1]) * 1.4)
        term_w = cols * char_w
        term_h = rows * char_h

    # Split-screen mode: page on left, terminal on right
    page_img = None
    page_img_timeline = []  # [(time_s, PIL.Image), ...] for multi-image mode
    half_w = args.width // 2

    if args.page_images:
        for spec in args.page_images:
            t_str, path = spec.split(":", 1)
            img = load_page_image(path, half_w, args.height)
            page_img_timeline.append((float(t_str), img))
        page_img_timeline.sort(key=lambda x: x[0])
        page_img = page_img_timeline[0][1]  # initial image
        term_area_w = half_w
        print(f"  Split-screen: {len(page_img_timeline)} page images, terminal {half_w}×{args.height}")
    elif args.page_image:
        page_img = load_page_image(args.page_image, half_w, args.height)
        term_area_w = half_w
        print(f"  Split-screen: page {half_w}×{args.height} | terminal {half_w}×{args.height}")
    else:
        term_area_w = args.width

    # Re-fit font if terminal area changed (split-screen shrinks it)
    if args.page_image or args.page_images:
        font_size = 24
        while font_size >= 10:
            if font_path_found:
                font = ImageFont.truetype(font_path_found, font_size)
            else:
                break
            bbox = font.getbbox("M")
            char_w = bbox[2] - bbox[0]
            char_h = int((bbox[3] - bbox[1]) * 1.4)
            term_w = cols * char_w
            term_h = rows * char_h
            if term_w <= term_area_w - PAD_MARGIN * 2 and term_h <= args.height - PAD_MARGIN * 2:
                break
            font_size -= 1

    print(f"  Font size: {font_size}px, char: {char_w}×{char_h}, term: {term_w}×{term_h}")

    # Center the terminal in its area (full frame or right half)
    if args.page_image or args.page_images:
        pad_x = half_w + (half_w - term_w) // 2
    else:
        pad_x = (args.width - term_w) // 2
    pad_y = (args.height - term_h) // 2

    # Load sieve overlay data (optional)
    overlay_events = []
    overlay_sieves = {}
    if args.overlay_data and os.path.exists(args.overlay_data):
        import json as _json
        with open(args.overlay_data) as f:
            od = _json.load(f)
        overlay_events = sorted(od.get('events', []), key=lambda e: e['t'])
        overlay_sieves = od.get('sieves', {})
        print(f"  Overlay: {len(overlay_events)} events, {len(overlay_sieves)} sieve datasets")

    # Set up pyte terminal emulator
    screen = pyte.Screen(cols, rows)
    stream = pyte.Stream(screen)

    # Pre-compute: for each frame, which events have been applied
    frame_interval = 1.0 / args.fps
    event_idx = 0

    print(f"Rendering {total_frames} frames at {args.fps}fps ({total_duration:.1f}s)...")

    with tempfile.TemporaryDirectory() as tmpdir:
        for frame_num in range(total_frames):
            frame_time = frame_num * frame_interval

            # Feed events up to this frame's time
            while event_idx < len(events) and events[event_idx][0] <= frame_time:
                stream.feed(events[event_idx][1])
                event_idx += 1

            # Render terminal frame (with optional page image on left)
            img = render_frame(screen, args.width, args.height, font, char_w, char_h, pad_x, pad_y)
            if page_img_timeline:
                # Pick the latest page image whose timestamp <= frame_time
                current_page = page_img_timeline[0][1]
                for t, pimg in page_img_timeline:
                    if t <= frame_time:
                        current_page = pimg
                    else:
                        break
                # Apply sieve overlay if data is present
                if overlay_events:
                    els, vp_w, vp_h, alpha, hl_el, hl_a = get_overlay_state(
                        frame_time, overlay_events, overlay_sieves)
                    if els or hl_el:
                        current_page = draw_sieve_overlay(
                            current_page, els, vp_w, vp_h, alpha, hl_el, hl_a)
                img.paste(current_page, (0, 0))
            elif page_img is not None:
                img.paste(page_img, (0, 0))
            img.save(f"{tmpdir}/frame_{frame_num:06d}.png")

            if frame_num % (args.fps * 2) == 0:
                print(f"  Frame {frame_num}/{total_frames} ({frame_time:.1f}s)")

        print("Encoding with ffmpeg...")
        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(args.fps),
            "-i", f"{tmpdir}/frame_%06d.png",
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            args.output,
        ], check=True, capture_output=True)

    print(f"Output: {args.output}")
    dur = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", args.output],
        capture_output=True, text=True,
    )
    print(f"Duration: {dur.stdout.strip()}s")


if __name__ == "__main__":
    main()
