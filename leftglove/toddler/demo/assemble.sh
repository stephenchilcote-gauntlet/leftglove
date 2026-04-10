#!/usr/bin/env bash
# assemble.sh — combine browser + terminal segments with voiceover audio
#
# Prerequisites:
#   1. make demo-browser  → test-results/browser-tour-*/video.webm
#                            audio-clips/timing.json
#   2. make demo-terminal → casts/*.cast → segments/*.mp4
#   3. gen-demo-audio.py  → audio-clips/manifest.json + *.wav
#
# Usage:
#   cd leftglove/toddler/demo && bash assemble.sh [--preview]
#   Output: <repo-root>/demo-final.mp4

set -euo pipefail
cd "$(dirname "$0")"

AUDIO_DIR="audio-clips"
TIMING_JSON="${AUDIO_DIR}/timing.json"
MANIFEST_JSON="${AUDIO_DIR}/manifest.json"
SEGMENTS_DIR="segments"
CASTS_DIR="casts"

# ── Step 0: Convert terminal .cast files to .mp4 ────────────────────────────

echo "Converting terminal segments..."
mkdir -p "$SEGMENTS_DIR"

# Render without page image first (page images extracted in Step 2b)
for cast in "$CASTS_DIR"/*.cast; do
  base=$(basename "$cast" .cast)
  mp4="$SEGMENTS_DIR/${base}.mp4"
  if [[ "$cast" -nt "$mp4" ]] || [[ ! -f "$mp4" ]]; then
    echo "  $cast → $mp4"
    python3 cast-to-mp4.py "$cast" "$mp4" --fps 15
  else
    echo "  $mp4 (up to date)"
  fi
done

# ── Step 1: Locate browser segment ──────────────────────────────────────────

BROWSER_VIDEO=$(find . -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
if [[ -z "$BROWSER_VIDEO" ]] && [[ -d "../test-results" ]]; then
  BROWSER_VIDEO=$(find ../test-results -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
fi
if [[ -z "$BROWSER_VIDEO" ]]; then
  echo "WARNING: No browser video found. Proceeding with terminal segments only."
  echo "Run 'make demo-browser' first for the full demo."
fi

# ── Step 2: Split browser video and normalize all segments ──────────────────

echo ""
echo "Splitting and normalizing video segments..."
mkdir -p "$SEGMENTS_DIR/normalized" "$SEGMENTS_DIR/browser-parts"

CONCAT_LIST="$SEGMENTS_DIR/concat.txt"
> "$CONCAT_LIST"

# Split browser video into act segments using timing log
if [[ -n "$BROWSER_VIDEO" ]] && [[ -f "$TIMING_JSON" ]]; then
  echo "  Splitting browser video into acts..."

  # Read split points from timing log (re-sieve-intro starts Act 3a, element-removed-intro starts Act 5a, closing)
  read ACT3A_START ACT5A_START CLOSING_START < <(python3 -c "
import json
with open('${TIMING_JSON}') as f:
    events = json.load(f)
by_clip = {e['clipId']: e['t']/1000.0 for e in events if e.get('clipId')}
print(by_clip.get('re-sieve-intro', 48.3), by_clip.get('element-removed-intro', 63.8), by_clip.get('closing', 81.0))
")

  SCALE_OPTS="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e"

  # Act 1: start to re-sieve-intro
  echo "  Browser Act 1: 0 to ${ACT3A_START}s"
  ffmpeg -y -i "$BROWSER_VIDEO" -t "$ACT3A_START" \
    -vf "$SCALE_OPTS" -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/browser-parts/act1.mp4" 2>/dev/null

  # Act 3a: re-sieve-intro to element-removed-intro
  ACT3A_DUR=$(python3 -c "print($ACT5A_START - $ACT3A_START)")
  echo "  Browser Act 3a: ${ACT3A_START}s to ${ACT5A_START}s"
  ffmpeg -y -i "$BROWSER_VIDEO" -ss "$ACT3A_START" -t "$ACT3A_DUR" \
    -vf "$SCALE_OPTS" -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/browser-parts/act3a.mp4" 2>/dev/null

  # Act 5a: element-removed-intro to closing
  ACT5A_DUR=$(python3 -c "print($CLOSING_START - $ACT5A_START)")
  echo "  Browser Act 5a: ${ACT5A_START}s to ${CLOSING_START}s"
  ffmpeg -y -i "$BROWSER_VIDEO" -ss "$ACT5A_START" -t "$ACT5A_DUR" \
    -vf "$SCALE_OPTS" -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/browser-parts/act5a.mp4" 2>/dev/null

  # Closing
  echo "  Browser Closing: ${CLOSING_START}s to end"
  ffmpeg -y -i "$BROWSER_VIDEO" -ss "$CLOSING_START" \
    -vf "$SCALE_OPTS" -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/browser-parts/closing.mp4" 2>/dev/null
elif [[ -n "$BROWSER_VIDEO" ]]; then
  # No timing log — fall back to whole browser segment
  echo "  WARNING: No timing log, using whole browser segment"
  ffmpeg -y -i "$BROWSER_VIDEO" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/browser-parts/act1.mp4" 2>/dev/null
fi

# ── Step 2b: Build split-screen terminal segments (page left, terminal right) ─

echo ""
echo "Building split-screen terminal segments..."
mkdir -p "$SEGMENTS_DIR/page-frames"

# Map each terminal segment to a browser timestamp for the page screenshot.
# Center-crop the browser frame to 960×1080 to show just the fundraiser content.
SEG_NAMES=( segment-5-code-change segment-6-test-passes segment-7-test-fails )
# Page frames are captured directly from the sieve browser (960×1080) during
# the browser tour. Map segment names to the screenshot filenames.
PAGE_FRAME_SOURCES=(
  "page-frames/code-change.png"
  "page-frames/test-passes.png"
  "page-frames/test-fails.png"
)

# Copy sieve screenshots to the page-frames dir used by cast-to-mp4
for i in "${!SEG_NAMES[@]}"; do
  seg_name="${SEG_NAMES[$i]}"
  src="${PAGE_FRAME_SOURCES[$i]}"
  if [[ -f "$src" ]]; then
    cp "$src" "$SEGMENTS_DIR/page-frames/${seg_name}.png"
    echo "  Page frame for $seg_name: $src ($(identify -format '%wx%h' "$src" 2>/dev/null))"
  else
    echo "  WARNING: $src not found — $seg_name will be terminal-only"
  fi
done

# Re-render terminal casts with page image baked in (split-screen)
for seg_name in "${SEG_NAMES[@]}"; do
  cast="$CASTS_DIR/${seg_name}.cast"
  page="$SEGMENTS_DIR/page-frames/${seg_name}.png"
  dst="$SEGMENTS_DIR/normalized/${seg_name}.mp4"

  if [[ ! -f "$cast" ]]; then
    echo "  WARNING: $cast not found, skipping"
    continue
  fi

  if [[ -f "$page" ]]; then
    echo "  Split-screen: $seg_name (page + terminal)..."
    python3 cast-to-mp4.py "$cast" "$dst" --fps 15 --page-image "$page"
  else
    echo "  Terminal only: $seg_name..."
    python3 cast-to-mp4.py "$cast" "$dst" --fps 15
  fi
done

# ── Segment 4 (interact): split-screen with page images that change ────────
PAGE_FRAMES_DIR="page-frames"
INTERACT_CAST="$CASTS_DIR/segment-4-interact.cast"
INTERACT_DST="$SEGMENTS_DIR/normalized/segment-4-interact.mp4"
if [[ -f "$INTERACT_CAST" ]]; then
  INTERACT_PAGES=()
  # Page images captured by browser tour at each interaction step
  if [[ -f "$PAGE_FRAMES_DIR/interact-before.png" ]]; then
    INTERACT_PAGES+=("0:$PAGE_FRAMES_DIR/interact-before.png")
  fi
  if [[ -f "$PAGE_FRAMES_DIR/interact-after-click.png" ]]; then
    INTERACT_PAGES+=("3.6:$PAGE_FRAMES_DIR/interact-after-click.png")
  fi
  if [[ -f "$PAGE_FRAMES_DIR/interact-after-fill.png" ]]; then
    INTERACT_PAGES+=("8.8:$PAGE_FRAMES_DIR/interact-after-fill.png")
  fi

  if [[ ${#INTERACT_PAGES[@]} -gt 0 ]]; then
    echo "  Split-screen: segment-4-interact (${#INTERACT_PAGES[@]} page images)..."
    python3 cast-to-mp4.py "$INTERACT_CAST" "$INTERACT_DST" --fps 15 \
      --page-images "${INTERACT_PAGES[@]}"
  else
    echo "  Terminal only: segment-4-interact (no page images found)..."
    python3 cast-to-mp4.py "$INTERACT_CAST" "$INTERACT_DST" --fps 15
  fi
fi

# Build concat list in story order:
#   Acts 1+2 (browser: sieve + interact) → code change → Act 3 (re-sieve) →
#   test passes → Act 5 (element gone) → test fails → Closing
echo ""
echo "Building story-order concat list..."
PARTS_DIR="$SEGMENTS_DIR/browser-parts"
NORM_DIR="$SEGMENTS_DIR/normalized"
for seg in \
  "$PARTS_DIR/act1.mp4" \
  "$NORM_DIR/segment-4-interact.mp4" \
  "$NORM_DIR/segment-5-code-change.mp4" \
  "$PARTS_DIR/act3a.mp4" \
  "$NORM_DIR/segment-6-test-passes.mp4" \
  "$PARTS_DIR/act5a.mp4" \
  "$NORM_DIR/segment-7-test-fails.mp4" \
  "$PARTS_DIR/closing.mp4"; do
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

# ── Step 3: Build voiceover audio ───────────────────────────────────────────

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
TERMINAL_TIMING = "casts/timing.json"
MANIFEST_JSON = f"{AUDIO_DIR}/manifest.json"
SAMPLE_RATE = 44100
PAD_MS = 300
GAP_MS = 200

# ── Read concat list to compute global offsets for each segment ──

concat_list = "segments/concat.txt"
segment_order = []
if os.path.exists(concat_list):
    with open(concat_list) as f:
        for line in f:
            seg_path = line.strip().split("'")[1] if "'" in line else ""
            if seg_path:
                segment_order.append(seg_path)

seg_offsets = {}  # segment name -> global start ms
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

# ── Map browser timing events to split browser segments ──
# Browser timing has offsets relative to the original unsplit recording.
# We need to remap to the new global positions of split browser parts.

timing = []

if os.path.exists(BROWSER_TIMING):
    with open(BROWSER_TIMING) as f:
        browser_events = json.load(f)

    # Browser split points (same as used in assemble.sh Step 2)
    by_clip = {e['clipId']: e['t'] for e in browser_events if e.get('clipId')}
    act3a_start_ms = by_clip.get('re-sieve-intro', 48300)
    act5a_start_ms = by_clip.get('element-removed-intro', 63800)
    closing_start_ms = by_clip.get('closing', 81000)

    # Map each browser event to its split segment + local offset
    for event in browser_events:
        clip_id = event.get('clipId')
        if not clip_id:
            continue
        orig_t = event['t']  # ms in original browser recording

        if orig_t < act3a_start_ms:
            seg_name = 'act1'
            local_t = orig_t
        elif orig_t < act5a_start_ms:
            seg_name = 'act3a'
            local_t = orig_t - act3a_start_ms
        elif orig_t < closing_start_ms:
            seg_name = 'act5a'
            local_t = orig_t - act5a_start_ms
        else:
            seg_name = 'closing'
            local_t = orig_t - closing_start_ms

        global_offset = seg_offsets.get(seg_name, 0)
        timing.append({
            "id": event.get('id', f"browser-{clip_id}"),
            "clipId": clip_id,
            "t": global_offset + local_t,
        })

# ── Add terminal timing events ──
if os.path.exists(TERMINAL_TIMING):
    with open(TERMINAL_TIMING) as f:
        terminal_events = json.load(f)

    for event in terminal_events:
        seg_name = event["segment"]
        global_offset = seg_offsets.get(seg_name, 0)
        timing.append({
            "id": f"term-{event['clipId']}",
            "clipId": event["clipId"],
            "t": global_offset + event["t"],
        })

# Sort by time
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

# Get combined video duration
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

# ── Step 4: Final assembly ──────────────────────────────────────────────────

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
    "$ROOT_DIR/demo-final.mp4" 2>/dev/null
else
  # Video only — no audio
  cp "$SEGMENTS_DIR/combined.mp4" "$ROOT_DIR/demo-final.mp4"
fi

echo ""
if command -v ffprobe &>/dev/null; then
  DUR=$(ffprobe -v quiet -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$ROOT_DIR/demo-final.mp4" 2>/dev/null || echo "?")
  echo "Duration: ${DUR}s"
fi
du -h "$ROOT_DIR/demo-final.mp4"
echo "Output: $ROOT_DIR/demo-final.mp4"

if [[ "${1:-}" == "--preview" ]]; then
  mpv "$ROOT_DIR/demo-final.mp4" 2>/dev/null || xdg-open "$ROOT_DIR/demo-final.mp4"
fi
