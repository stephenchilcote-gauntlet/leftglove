#!/usr/bin/env python3
"""
Convert asciinema .cast files to MP4 video.

Uses pyte (terminal emulator) to render frames and Pillow to produce images,
then ffmpeg to encode to video.

Usage: python3 cast-to-mp4.py input.cast output.mp4 [--fps 30] [--width 1920] [--height 1080]
"""

import argparse
import json
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
