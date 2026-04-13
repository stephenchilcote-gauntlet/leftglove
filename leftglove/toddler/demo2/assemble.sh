#!/usr/bin/env bash
# assemble.sh — combine browser recording + title cards with voiceover
#
# LeftGlove + OpenClaw Hype Demo v2
#
# Prerequisites:
#   1. make demo2-browser  → test-results/browser-tour-*/video.webm
#                             audio-clips/timing.json
#   2. gen-demo-audio.py   → audio-clips/manifest.json + *.wav
#
# Usage:
#   cd leftglove/toddler/demo2 && bash assemble.sh [--preview]
#   Output: <repo-root>/demo2-final.mp4

set -euo pipefail
cd "$(dirname "$0")"

AUDIO_DIR="audio-clips"
TIMING_JSON="${AUDIO_DIR}/timing.json"
MANIFEST_JSON="${AUDIO_DIR}/manifest.json"
SEGMENTS_DIR="segments"

SCALE_OPTS="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e"

# ── Step 0: Generate title cards ──────────────────────────────────────────

echo "Generating title cards..."
mkdir -p "$SEGMENTS_DIR/title-cards"

generate_title_card() {
  local text="$1"
  local output="$2"
  local duration="${3:-5}"
  local fontsize="${4:-42}"

  local escaped
  escaped=$(echo "$text" | sed "s/'/\\\\'/g" | sed 's/:/\\:/g')

  ffmpeg -y \
    -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=${duration}" \
    -vf "drawtext=text='${escaped}':fontcolor=#cce8ff:fontsize=${fontsize}:\
x=(w-text_w)/2:y=(h-text_h)/2:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$output" 2>/dev/null

  echo "  Title card: $output (${duration}s)"
}

generate_title_card \
  "Your AI agent just looked at Amazon." \
  "$SEGMENTS_DIR/title-cards/cold-open.mp4" \
  6 48

generate_title_card \
  "LeftGlove + OpenClaw" \
  "$SEGMENTS_DIR/title-cards/closing-card.mp4" \
  5 56

# ── Step 1: Locate and normalize browser recording ────────────────────────

echo ""
echo "Locating browser recording..."

BROWSER_VIDEO=$(find . -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
if [[ -z "$BROWSER_VIDEO" ]] && [[ -d "../test-results" ]]; then
  BROWSER_VIDEO=$(find ../test-results -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
fi
if [[ -z "$BROWSER_VIDEO" ]]; then
  echo "ERROR: No browser video found. Run 'make demo2-browser' first."
  exit 1
fi

echo "  Found: $BROWSER_VIDEO"

mkdir -p "$SEGMENTS_DIR/normalized"

# Normalize browser video to 1920x1080 h264
echo "  Normalizing..."
ffmpeg -y -i "$BROWSER_VIDEO" \
  -vf "$SCALE_OPTS" -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/normalized/browser-tour.mp4" 2>/dev/null

# ── Step 2: Build concat list ─────────────────────────────────────────────

echo ""
echo "Building concat list..."

CONCAT_LIST="$SEGMENTS_DIR/concat.txt"
> "$CONCAT_LIST"

TC_DIR="$SEGMENTS_DIR/title-cards"
NORM_DIR="$SEGMENTS_DIR/normalized"

for seg in \
  "$TC_DIR/cold-open.mp4" \
  "$NORM_DIR/browser-tour.mp4" \
  "$TC_DIR/closing-card.mp4"; do
  if [[ -f "$seg" ]]; then
    echo "file '$(pwd)/$seg'" >> "$CONCAT_LIST"
    dur=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$seg")
    echo "  $(basename $seg): ${dur}s"
  fi
done

echo ""
echo "Concatenating segments..."
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
  -c copy \
  "$SEGMENTS_DIR/combined.mp4" 2>/dev/null

COMBINED_DURATION=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/combined.mp4")
echo "Combined video duration: ${COMBINED_DURATION}s"

# ── Step 3: Build voiceover audio ─────────────────────────────────────────

if [[ -f "$MANIFEST_JSON" ]]; then
  echo ""
  echo "Building voiceover audio track..."

  python3 - <<'PYEOF'
import json
import subprocess
import os
import sys

AUDIO_DIR = "audio-clips"
BROWSER_TIMING = f"{AUDIO_DIR}/timing.json"
MANIFEST_JSON = f"{AUDIO_DIR}/manifest.json"
SAMPLE_RATE = 44100
PAD_MS = 300
GAP_MS = 200

# Read concat list to compute global offsets
concat_list = "segments/concat.txt"
segment_order = []
if os.path.exists(concat_list):
    with open(concat_list) as f:
        for line in f:
            seg_path = line.strip().split("'")[1] if "'" in line else ""
            if seg_path:
                segment_order.append(seg_path)

seg_offsets = {}
cumulative_ms = 0
for seg_path in segment_order:
    seg_name = os.path.basename(seg_path).replace(".mp4", "")
    seg_offsets[seg_name] = cumulative_ms
    dur_out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", seg_path],
        capture_output=True, text=True,
    )
    try:
        dur_s = float(dur_out.stdout.strip())
    except ValueError:
        dur_s = 0
    cumulative_ms += int(dur_s * 1000)
    print(f"  Segment {seg_name}: starts at {seg_offsets[seg_name]/1000:.1f}s, duration {dur_s:.1f}s")

# Map browser timing events to global timeline
timing = []

if os.path.exists(BROWSER_TIMING):
    with open(BROWSER_TIMING) as f:
        browser_events = json.load(f)

    browser_offset = seg_offsets.get("browser-tour", 0)
    for event in browser_events:
        clip_id = event.get("clipId")
        if not clip_id:
            continue
        timing.append({
            "id": event.get("id", f"browser-{clip_id}"),
            "clipId": clip_id,
            "t": browser_offset + event["t"],
        })

# Title card timing
title_clips = {
    "cold-open": "cold-open",
}
for tc_name, clip_id in title_clips.items():
    offset = seg_offsets.get(tc_name, 0)
    timing.append({
        "id": f"tc-{clip_id}",
        "clipId": clip_id,
        "t": offset + 500,
    })

timing.sort(key=lambda e: e.get("t", 0))

if not timing:
    print("WARNING: No timing events found. Skipping voiceover.")
    sys.exit(0)

with open(MANIFEST_JSON) as f:
    manifest = json.load(f)

manifest_by_id = {c["id"]: c for c in manifest}
print(f"Timing events: {len(timing)}, Audio clips: {len(manifest_by_id)}")

clips = []
prev_end_ms = 0
for event in timing:
    clip_id = event.get("clipId")
    if not clip_id:
        continue
    entry = manifest_by_id.get(clip_id)
    if not entry or entry.get("duration_ms", 0) == 0:
        print(f"  SKIP: {clip_id} — not in manifest or zero duration")
        continue
    wav = entry["path"]
    if not os.path.exists(wav):
        print(f"  SKIP: {wav} not found")
        continue
    desired_ms = event["t"] + PAD_MS
    start_ms = max(desired_ms, prev_end_ms + GAP_MS)
    lag = start_ms - desired_ms
    lag_str = f"  [+{lag}ms lag]" if lag > 0 else ""
    print(f"  t={start_ms/1000:.1f}s  {clip_id}  ({entry['duration_ms']}ms){lag_str}")
    clips.append({"wav": wav, "start_ms": start_ms, "id": clip_id})
    prev_end_ms = start_ms + entry["duration_ms"]

if not clips:
    print("WARNING: No audio clips matched timing events. Skipping voiceover.")
    sys.exit(0)

print(f"Paired {len(clips)} clips")

dur_out = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", "segments/combined.mp4"],
    capture_output=True, text=True,
)
video_dur = float(dur_out.stdout.strip())
total_s = max(video_dur, prev_end_ms / 1000.0 + 1.0)

cmd = ["ffmpeg", "-y",
       "-f", "lavfi", "-i", f"anullsrc=r={SAMPLE_RATE}:cl=mono:d={total_s:.2f}"]
for c in clips:
    cmd += ["-i", c["wav"]]

filter_parts = []
for i, c in enumerate(clips):
    filter_parts.append(f"[{i+1}:a]aresample={SAMPLE_RATE},adelay={c['start_ms']}|{c['start_ms']}[a{i}]")

all_labels = "[0:a]" + "".join(f"[a{i}]" for i in range(len(clips)))
filter_parts.append(f"{all_labels}amix=inputs={len(clips)+1}:normalize=0[out]")

cmd += ["-filter_complex", ";".join(filter_parts),
        "-map", "[out]", "-c:a", "pcm_s16le",
        f"{AUDIO_DIR}/voiceover.wav"]

result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("ffmpeg stderr:", result.stderr[-2000:])
    sys.exit(f"ffmpeg failed with code {result.returncode}")
print(f"Voiceover written to {AUDIO_DIR}/voiceover.wav")
PYEOF

  # Two-pass LUFS normalization
  echo ""
  echo "Normalising voiceover to -14 LUFS..."

  LUFS_RAW=$(ffmpeg -y -i "${AUDIO_DIR}/voiceover.wav" \
    -af "loudnorm=I=-14:LRA=11:TP=-1.0:print_format=json" \
    -f null /dev/null 2>&1)

  read measured_I measured_LRA measured_TP measured_thresh offset < <(echo "$LUFS_RAW" | python3 -c "
import sys, re, json
raw = sys.stdin.read()
m = re.search(r'\{[^}]+\}', raw, re.DOTALL)
d = json.loads(m.group())
print(d['input_i'], d['input_lra'], d['input_tp'], d['input_thresh'], d['target_offset'])
")

  echo "  Measured: ${measured_I} LUFS  TP: ${measured_TP} dBTP"

  ffmpeg -y -i "${AUDIO_DIR}/voiceover.wav" \
    -af "loudnorm=I=-14:LRA=11:TP=-1.0:\
measured_I=${measured_I}:measured_LRA=${measured_LRA}:\
measured_TP=${measured_TP}:measured_thresh=${measured_thresh}:\
offset=${offset}:linear=true" \
    -ar 44100 \
    "${AUDIO_DIR}/voiceover_norm.wav" 2>/dev/null

  echo "  Normalised voiceover written."
  HAS_AUDIO=true
else
  echo ""
  echo "No manifest.json — skipping voiceover."
  echo "Run gen-demo-audio.py first for audio."
  HAS_AUDIO=false
fi

# ── Step 4: Final assembly ────────────────────────────────────────────────

echo ""
echo "Assembling final video..."

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ "$HAS_AUDIO" == "true" ]]; then
  ffmpeg -y \
    -i "$SEGMENTS_DIR/combined.mp4" \
    -i "${AUDIO_DIR}/voiceover_norm.wav" \
    -c:v libx264 -crf 18 -preset fast -movflags +faststart \
    -c:a aac -b:a 192k \
    -shortest \
    "$ROOT_DIR/demo2-final.mp4" 2>/dev/null
else
  cp "$SEGMENTS_DIR/combined.mp4" "$ROOT_DIR/demo2-final.mp4"
fi

echo ""
if command -v ffprobe &>/dev/null; then
  DUR=$(ffprobe -v quiet -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$ROOT_DIR/demo2-final.mp4" 2>/dev/null || echo "?")
  echo "Duration: ${DUR}s"
fi
du -h "$ROOT_DIR/demo2-final.mp4"
echo "Output: $ROOT_DIR/demo2-final.mp4"

if [[ "${1:-}" == "--preview" ]]; then
  mpv "$ROOT_DIR/demo2-final.mp4" 2>/dev/null || xdg-open "$ROOT_DIR/demo2-final.mp4"
fi
