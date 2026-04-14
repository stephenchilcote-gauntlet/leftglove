#!/usr/bin/env bash
# assemble.sh — Demo 3 final video assembly
#
# Inputs:
#   1. test-results/browser-tour-*/video.webm  — Playwright recording (segments A-D)
#   2. segments/ebay-split.mp4                  — Split-screen eBay workflow
#   3. segments/rc-split.mp4                    — Split-screen RC workflow
#   4. audio-clips/manifest.json + *.wav        — Voiceover (optional)
#
# Output: <repo-root>/demo3-final.mp4
#
# Video structure (matches spec):
#   [title-card 5s] [html-scroll + TL-UI + classify + overlay ~40s] [ebay-split ~22s]
#   [rc-split ~37s] [closing-card 10s]
#
# Usage:
#   cd leftglove/toddler/demo3 && bash assemble.sh

set -euo pipefail
cd "$(dirname "$0")"

SEGMENTS_DIR="segments"
AUDIO_DIR="audio-clips"
REPO_ROOT="$(cd ../../.. && pwd)"

mkdir -p "$SEGMENTS_DIR/normalized" "$SEGMENTS_DIR/title-cards"

# ── Step 1: Locate and normalize browser recording ──────────────────────────

echo "=== Step 1: Normalize browser recording ==="

BROWSER_VIDEO=""
if [[ -f "$SEGMENTS_DIR/normalized/intro.mp4" ]]; then
  echo "  Using existing normalized intro."
else
  BROWSER_VIDEO=$(find . -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
  if [[ -z "$BROWSER_VIDEO" ]]; then
    echo "ERROR: No browser video found. Run 'npx playwright test' first."
    exit 1
  fi
  echo "  Found: $BROWSER_VIDEO"
  ffmpeg -y -i "$BROWSER_VIDEO" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/normalized/intro.mp4" 2>/dev/null
fi

INTRO_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/intro.mp4")
echo "  Intro video: ${INTRO_DUR}s"

# ── Step 2: Verify split-screen segments exist ──────────────────────────────

echo ""
echo "=== Step 2: Verify split-screen segments ==="

for seg in "ebay-split.mp4" "rc-split.mp4"; do
  if [[ ! -f "$SEGMENTS_DIR/$seg" ]]; then
    echo "ERROR: Missing $SEGMENTS_DIR/$seg. Run: python3 build-split-screen.py"
    exit 1
  fi
  dur=$(ffprobe -v quiet -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/$seg")
  echo "  $seg: ${dur}s"
done

# ── Step 3: Generate title cards ────────────────────────────────────────────

echo ""
echo "=== Step 3: Title cards ==="

# Opening: "LeftGlove" intro (5s)
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=5" \
  -vf "drawtext=text='LeftGlove':fontcolor=#cce8ff:fontsize=72:\
x=(w-text_w)/2:y=(h/2)-60:\
fontfile=/usr/share/fonts/TTF/DejaVuSans-Bold.ttf,\
drawtext=text='What does your AI agent actually see?':fontcolor=#7799bb:fontsize=28:\
x=(w-text_w)/2:y=(h/2)+20:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/opening.mp4" 2>/dev/null
echo "  opening.mp4 (5s)"

# eBay intro card (3s) — transition into the workflow
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=3" \
  -vf "drawtext=text='Workflow 1\: Competitor Pricing on eBay':fontcolor=#cce8ff:fontsize=40:\
x=(w-text_w)/2:y=(h-text_h)/2:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/ebay-intro.mp4" 2>/dev/null
echo "  ebay-intro.mp4 (3s)"

# RC intro card (3s)
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=3" \
  -vf "drawtext=text='Workflow 2\: Book a Campsite on ReserveCalifornia':fontcolor=#cce8ff:fontsize=40:\
x=(w-text_w)/2:y=(h-text_h)/2:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/rc-intro.mp4" 2>/dev/null
echo "  rc-intro.mp4 (3s)"

# Business impact card (5s)
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=5" \
  -vf "drawtext=text='On-demand competitive intelligence.':fontcolor=#cce8ff:fontsize=36:\
x=(w-text_w)/2:y=(h/2)-40:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf,\
drawtext=text='No scraping infrastructure. No maintenance.':fontcolor=#7799bb:fontsize=24:\
x=(w-text_w)/2:y=(h/2)+20:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/business-impact.mp4" 2>/dev/null
echo "  business-impact.mp4 (5s)"

# Closing card (10s)
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=10" \
  -vf "drawtext=text='LeftGlove':fontcolor=#cce8ff:fontsize=64:\
x=(w-text_w)/2:y=(h/2)-70:\
fontfile=/usr/share/fonts/TTF/DejaVuSans-Bold.ttf,\
drawtext=text='Make AI agents more reliable, faster,':fontcolor=#7799bb:fontsize=28:\
x=(w-text_w)/2:y=(h/2)+10:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf,\
drawtext=text='and cheaper to operate.':fontcolor=#7799bb:fontsize=28:\
x=(w-text_w)/2:y=(h/2)+50:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/closing.mp4" 2>/dev/null
echo "  closing.mp4 (10s)"

# ── Step 4: Normalize split-screen segments to same codec ───────────────────

echo ""
echo "=== Step 4: Normalize split-screen segments ==="

# eBay split: 2x speed (21.97s → ~11s) — narration covers full action, no dead air
if [[ ! -f "$SEGMENTS_DIR/normalized/ebay-split.mp4" ]] || \
   [[ "$SEGMENTS_DIR/ebay-split.mp4" -nt "$SEGMENTS_DIR/normalized/ebay-split.mp4" ]]; then
  ffmpeg -y -i "$SEGMENTS_DIR/ebay-split.mp4" \
    -vf "setpts=0.5*PTS" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/normalized/ebay-split.mp4" 2>/dev/null
  echo "  Normalized ebay-split.mp4 (2x speed)"
else
  echo "  ebay-split.mp4 already normalized"
fi

# RC split: 2.5x speed (36.5s → ~14.6s) + 3s freeze on last frame (booking popup hold)
if [[ ! -f "$SEGMENTS_DIR/normalized/rc-split.mp4" ]] || \
   [[ "$SEGMENTS_DIR/rc-split.mp4" -nt "$SEGMENTS_DIR/normalized/rc-split.mp4" ]]; then
  ffmpeg -y -i "$SEGMENTS_DIR/rc-split.mp4" \
    -vf "setpts=0.4*PTS,tpad=stop=90:stop_mode=clone" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/normalized/rc-split.mp4" 2>/dev/null
  echo "  Normalized rc-split.mp4 (2.5x speed + 3s booking popup hold)"
else
  echo "  rc-split.mp4 already normalized"
fi

# ── Step 5: Concatenate all segments ────────────────────────────────────────

echo ""
echo "=== Step 5: Concatenate ==="

CONCAT_LIST="$SEGMENTS_DIR/concat.txt"
> "$CONCAT_LIST"

TOTAL_DUR=0
for seg in \
  "$SEGMENTS_DIR/title-cards/opening.mp4" \
  "$SEGMENTS_DIR/normalized/intro.mp4" \
  "$SEGMENTS_DIR/title-cards/ebay-intro.mp4" \
  "$SEGMENTS_DIR/normalized/ebay-split.mp4" \
  "$SEGMENTS_DIR/title-cards/business-impact.mp4" \
  "$SEGMENTS_DIR/title-cards/rc-intro.mp4" \
  "$SEGMENTS_DIR/normalized/rc-split.mp4" \
  "$SEGMENTS_DIR/title-cards/closing.mp4"; do
  echo "file '$(pwd)/$seg'" >> "$CONCAT_LIST"
  dur=$(ffprobe -v quiet -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$seg")
  TOTAL_DUR=$(python3 -c "print($TOTAL_DUR + $dur)")
  printf "  %-40s %6ss\n" "$(basename $seg)" "$dur"
done

echo "  ────────────────────────────────────────"
printf "  %-40s %6ss\n" "TOTAL" "$TOTAL_DUR"

ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
  -c copy \
  "$SEGMENTS_DIR/final-silent.mp4" 2>/dev/null

echo "  → final-silent.mp4"

# ── Step 6: Add fade transitions ────────────────────────────────────────────

echo ""
echo "=== Step 6: Fade transitions ==="

# Calculate segment boundaries for fades
OPENING_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/title-cards/opening.mp4")
INTRO_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/intro.mp4")
EBAY_INTRO_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/title-cards/ebay-intro.mp4")
EBAY_SPLIT_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/ebay-split.mp4")
BUSINESS_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/title-cards/business-impact.mp4")
RC_INTRO_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/title-cards/rc-intro.mp4")
RC_SPLIT_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/rc-split.mp4")

# Transition points (approximate — between major segments)
T1=$(python3 -c "print($OPENING_DUR + $INTRO_DUR)")
T2=$(python3 -c "print($T1 + $EBAY_INTRO_DUR + $EBAY_SPLIT_DUR + $BUSINESS_DUR)")
T3=$(python3 -c "print($TOTAL_DUR - 1)")

echo "  Fade-in:  0-1.2s"
echo "  Fade-out: ${T3}s-end"

ffmpeg -y -i "$SEGMENTS_DIR/final-silent.mp4" \
  -vf "fade=t=in:st=0:d=1.2:color=0x1a1a2e,\
fade=t=out:st=${T3}:d=1:color=0x1a1a2e" \
  -c:v libx264 -crf 18 -preset fast -c:a copy -r 30 \
  "$SEGMENTS_DIR/final-faded.mp4" 2>/dev/null

echo "  → final-faded.mp4"

# ── Step 6b: Build voiceover audio (if manifest exists) ─────────────────────

MANIFEST_JSON="${AUDIO_DIR}/manifest.json"
TIMING_JSON="${AUDIO_DIR}/timing.json"

if [[ -f "$MANIFEST_JSON" ]] && [[ -f "$TIMING_JSON" ]]; then
  echo ""
  echo "=== Step 6b: Voiceover assembly ==="

  python3 - <<'PYEOF'
import json
import subprocess
import os
import sys

AUDIO_DIR = "audio-clips"
TIMING_JSON = f"{AUDIO_DIR}/timing.json"
MANIFEST_JSON = f"{AUDIO_DIR}/manifest.json"
SAMPLE_RATE = 44100
PAD_MS = 300
GAP_MS = 200

# timing.json already has absolute positions — no title card offset needed
TITLE_CARD_OFFSET_MS = 0

with open(TIMING_JSON) as f:
    timing_events = json.load(f)

with open(MANIFEST_JSON) as f:
    manifest = json.load(f)

manifest_by_id = {c["id"]: c for c in manifest}
print(f"Timing events: {len(timing_events)}, Audio clips: {len(manifest_by_id)}")

clips = []
prev_end_ms = 0
for event in timing_events:
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
    lag_str = f"  [{lag:+d}ms]" if lag != 0 else ""
    print(f"  t={start_ms/1000:.1f}s  {clip_id}  ({entry['duration_ms']}ms){lag_str}")
    clips.append({"wav": wav, "start_ms": start_ms, "id": clip_id})
    prev_end_ms = start_ms + entry["duration_ms"]

if not clips:
    print("WARNING: No audio clips matched. Skipping voiceover.")
    sys.exit(0)

print(f"Paired {len(clips)} clips")

dur_out = subprocess.run(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", "segments/final-silent.mp4"],
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

  if [[ -f "${AUDIO_DIR}/voiceover.wav" ]]; then
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
  fi
else
  echo ""
  echo "No manifest.json or timing.json — skipping voiceover."
fi

# ── Step 7: Mux audio (if available) ────────────────────────────────────────

echo ""
echo "=== Step 7: Final output ==="

OUTPUT="$REPO_ROOT/demo3-final.mp4"

if [[ -f "$AUDIO_DIR/voiceover_norm.wav" ]]; then
  echo "  Muxing with voiceover..."
  ffmpeg -y \
    -i "$SEGMENTS_DIR/final-faded.mp4" \
    -i "$AUDIO_DIR/voiceover_norm.wav" \
    -c:v copy -c:a aac -b:a 192k \
    -shortest \
    "$OUTPUT" 2>/dev/null
else
  echo "  No voiceover — video only."
  cp "$SEGMENTS_DIR/final-faded.mp4" "$OUTPUT"
fi

FINAL_DUR=$(ffprobe -v quiet -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")
FINAL_SIZE=$(du -h "$OUTPUT" | cut -f1)

echo ""
echo "═══════════════════════════════════════════"
echo "  Output: $OUTPUT"
echo "  Duration: ${FINAL_DUR}s"
echo "  Size: $FINAL_SIZE"
echo "═══════════════════════════════════════════"
