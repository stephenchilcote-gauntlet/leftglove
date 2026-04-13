#!/usr/bin/env bash
# speed-ramp.sh — Speed up silent sections of the demo video
#
# Speeds up the auto-classify waiting sections (no narration) while
# keeping narrated sections at normal speed. Regenerates subtitles
# for the new timing.
#
# Usage: cd demo2 && bash speed-ramp.sh

set -euo pipefail
cd "$(dirname "$0")"

ROOT_DIR="$(cd "../../.." && pwd)"
INPUT="$ROOT_DIR/demo2-final.mp4"
OUTPUT="$ROOT_DIR/demo2-final-fast.mp4"

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: $INPUT not found. Run assemble.sh first."
  exit 1
fi

# Read timing to find silence boundaries
python3 - "$INPUT" "$OUTPUT" <<'PYEOF'
import json, subprocess, sys, os

INPUT = sys.argv[1]
OUTPUT = sys.argv[2]

TIMING_FILE = "audio-clips/timing.json"
MANIFEST_FILE = "audio-clips/manifest.json"
TITLE_CARD_OFFSET_MS = 5000
PAD_MS = 300
GAP_MS = 200

with open(TIMING_FILE) as f:
    timing = json.load(f)
with open(MANIFEST_FILE) as f:
    manifest = {c["id"]: c for c in json.load(f)}

# Calculate clip placements (same as voiceover assembly)
clips = []
prev_end_ms = 0
for ev in timing:
    cid = ev.get("clipId")
    entry = manifest.get(cid)
    if not entry or entry.get("duration_ms", 0) == 0:
        continue
    desired_ms = ev["t"] + TITLE_CARD_OFFSET_MS + PAD_MS
    start_ms = max(desired_ms, prev_end_ms + GAP_MS)
    end_ms = start_ms + entry["duration_ms"]
    clips.append({"id": cid, "start": start_ms / 1000.0, "end": end_ms / 1000.0})
    prev_end_ms = end_ms

# Find silence gaps > 5s between narrated sections
gaps = []
for i in range(len(clips) - 1):
    gap_start = clips[i]["end"]
    gap_end = clips[i + 1]["start"]
    gap_dur = gap_end - gap_start
    if gap_dur > 5.0:
        # Keep 2s bookends at normal speed
        speed_start = gap_start + 2.0
        speed_end = gap_end - 2.0
        if speed_end > speed_start:
            gaps.append({
                "start": speed_start,
                "end": speed_end,
                "original_dur": speed_end - speed_start,
                "speed": 6.0,  # 6x speed
            })

if not gaps:
    print("No significant silence gaps found. Nothing to speed-ramp.")
    sys.exit(0)

print(f"Found {len(gaps)} silence gaps to speed-ramp:")
total_saved = 0
for g in gaps:
    new_dur = g["original_dur"] / g["speed"]
    saved = g["original_dur"] - new_dur
    total_saved += saved
    print(f"  {g['start']:.1f}s-{g['end']:.1f}s: {g['original_dur']:.1f}s → {new_dur:.1f}s ({g['speed']:.0f}x, saves {saved:.1f}s)")

# Get video duration
dur_result = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", INPUT],
    capture_output=True, text=True)
video_dur = float(dur_result.stdout.strip())
print(f"\nOriginal duration: {video_dur:.1f}s")
print(f"Estimated new duration: {video_dur - total_saved:.1f}s")

# Build ffmpeg filter chain
# Create segments: normal-speed sections and sped-up sections
segments = []
cursor = 0.0

for g in gaps:
    # Normal section before this gap's speed-up zone
    if g["start"] > cursor:
        segments.append({"start": cursor, "end": g["start"], "speed": 1.0})
    # Sped-up section
    segments.append({"start": g["start"], "end": g["end"], "speed": g["speed"]})
    cursor = g["end"]

# Final normal section
if cursor < video_dur:
    segments.append({"start": cursor, "end": video_dur, "speed": 1.0})

# Build video filter
v_filters = []
a_filters = []
v_labels = []
a_labels = []

for i, seg in enumerate(segments):
    vl = f"v{i}"
    al = f"a{i}"

    if seg["speed"] == 1.0:
        v_filters.append(f"[0:v]trim={seg['start']:.3f}:{seg['end']:.3f},setpts=PTS-STARTPTS[{vl}]")
        a_filters.append(f"[0:a]atrim={seg['start']:.3f}:{seg['end']:.3f},asetpts=PTS-STARTPTS[{al}]")
    else:
        v_filters.append(f"[0:v]trim={seg['start']:.3f}:{seg['end']:.3f},setpts=(PTS-STARTPTS)/{seg['speed']:.1f}[{vl}]")
        # Chain atempo filters (max 2.0 each)
        atempo_chain = []
        remaining = seg["speed"]
        while remaining > 2.0:
            atempo_chain.append("atempo=2.0")
            remaining /= 2.0
        if remaining > 1.01:
            atempo_chain.append(f"atempo={remaining:.4f}")
        if not atempo_chain:
            atempo_chain = ["atempo=1.0"]
        a_filters.append(f"[0:a]atrim={seg['start']:.3f}:{seg['end']:.3f},asetpts=PTS-STARTPTS,{','.join(atempo_chain)}[{al}]")

    v_labels.append(f"[{vl}]")
    a_labels.append(f"[{al}]")

n = len(segments)
concat_input = "".join(f"{v_labels[i]}{a_labels[i]}" for i in range(n))
full_filter = ";".join(v_filters + a_filters) + f";{concat_input}concat=n={n}:v=1:a=1[outv][outa]"

cmd = [
    "ffmpeg", "-y", "-i", INPUT,
    "-filter_complex", full_filter,
    "-map", "[outv]", "-map", "[outa]",
    "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k",
    OUTPUT,
]

print(f"\nRunning speed-ramp...")
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("ffmpeg error:", result.stderr[-2000:])
    sys.exit(1)

# Get new duration
dur_result = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", OUTPUT],
    capture_output=True, text=True)
new_dur = float(dur_result.stdout.strip())
print(f"Speed-ramped video: {new_dur:.1f}s (saved {video_dur - new_dur:.1f}s)")

# Now generate adjusted subtitles
# Build time mapping: for each original timestamp, what's the new timestamp?
def map_time(t):
    """Map original video time to speed-ramped time."""
    new_t = 0.0
    for seg in segments:
        if t <= seg["start"]:
            break
        seg_dur = min(t, seg["end"]) - seg["start"]
        new_t += seg_dur / seg["speed"]
        if t <= seg["end"]:
            break
    return new_t

# Script text for subtitles
script = {
    "ebay-sieve": [
        "Hundreds of elements on a live eBay search page.",
        "Every button, every link, every filter.",
        "The sieve found them all.",
        "No LLM. No vision model. Zero tokens.",
    ],
    "ebay-highlights": [
        "Nav.sign-in is clickable.",
        "Nav.deals is clickable.",
        "Nav.cart is clickable.",
        "Structured. Deterministic. Named.",
    ],
    "campsite-intro": [
        "Now a state park reservation system.",
        "Completely different site. Live.",
    ],
    "campsite-sieve": [
        "Over a hundred elements.",
        "Park info, login controls, navigation, share buttons.",
        "All detected instantly.",
    ],
    "campsite-highlights": [
        "Banner.park-title is readable.",
        "Nav.login-button is clickable.",
        "Banner.directions-button is clickable.",
        "Every element named.",
    ],
    "closing": [
        "The sieve sees everything.",
        "The glossary names everything.",
        "The agent knows everything.",
        "LeftGlove + OpenClaw.",
        "Deterministic page understanding for AI agents.",
    ],
}

def ts(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int((s % 1) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

subs = []
idx = 1
for clip in clips:
    lines = script.get(clip["id"], [])
    if not lines:
        continue
    clip_dur = clip["end"] - clip["start"]
    line_dur = clip_dur / len(lines)
    for i, line in enumerate(lines):
        orig_start = clip["start"] + i * line_dur
        orig_end = clip["start"] + (i + 1) * line_dur
        new_start = map_time(orig_start)
        new_end = map_time(orig_end)
        subs.append((idx, new_start, new_end, line))
        idx += 1

srt_path = "subtitles-fast.srt"
with open(srt_path, "w") as f:
    for i, start, end, text in subs:
        f.write(f"{i}\n{ts(start)} --> {ts(end)}\n{text}\n\n")
print(f"Generated {len(subs)} adjusted subtitle entries → {srt_path}")

# Burn subtitles
OUTPUT_SUBS = OUTPUT.replace(".mp4", "-subs.mp4")
cmd_subs = [
    "ffmpeg", "-y", "-i", OUTPUT,
    "-vf", f"subtitles={srt_path}:force_style='FontSize=22,FontName=DejaVu Sans,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=40'",
    "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-movflags", "+faststart",
    "-c:a", "copy",
    OUTPUT_SUBS,
]
result = subprocess.run(cmd_subs, capture_output=True, text=True)
if result.returncode != 0:
    print("Subtitle burn error:", result.stderr[-2000:])
else:
    size_mb = os.path.getsize(OUTPUT_SUBS) / 1e6
    print(f"Subtitled speed-ramped video: {OUTPUT_SUBS} ({size_mb:.1f}MB)")

PYEOF
