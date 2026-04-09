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

    # Find a monospace font
    font = None
    font_size = 24
    for font_path in [
        "/usr/share/fonts/TTF/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
    ]:
        if Path(font_path).exists():
            font = ImageFont.truetype(font_path, font_size)
            break
    if font is None:
        font = ImageFont.load_default()
        font_size = 10

    # Measure character size
    bbox = font.getbbox("M")
    char_w = bbox[2] - bbox[0]
    char_h = int((bbox[3] - bbox[1]) * 1.4)  # add line spacing

    # Center the terminal in the frame
    term_w = cols * char_w
    term_h = rows * char_h
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

            # Render every Nth frame (skip unchanged frames for speed)
            img = render_frame(screen, args.width, args.height, font, char_w, char_h, pad_x, pad_y)
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
