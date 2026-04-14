#!/usr/bin/env bash
# assemble.sh — assemble full-screen demo recording into final video
#
# LeftGlove + OpenClaw Hype Demo v2
#
# Prerequisites:
#   1. npx playwright test  → test-results/browser-tour-*/video.webm (1920x1080)
#                              audio-clips/timing.json
#   2. gen-demo-audio.py    → audio-clips/manifest.json + *.wav (optional)
#
# Output: 1920x1080 full-screen video (no split screen, no terminal)
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

# ── Step 1: Locate and normalize browser recording ─────────────────────────

echo "Locating browser recording..."

# Prefer existing normalized copy (avoids re-normalizing from wrong source)
if [[ -f "$SEGMENTS_DIR/normalized/main.mp4" ]]; then
  echo "  Using existing normalized copy."
  MAIN_DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/main.mp4")
  echo "  Main video: ${MAIN_DUR}s"
  SKIP_NORMALIZE=true
else
  BROWSER_VIDEO=$(find . -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
  if [[ -z "$BROWSER_VIDEO" ]] && [[ -d "../test-results" ]]; then
    BROWSER_VIDEO=$(find ../test-results -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
  fi
  if [[ -z "$BROWSER_VIDEO" ]] && [[ -d "../demo/test-results" ]]; then
    BROWSER_VIDEO=$(find ../demo/test-results -name "video.webm" -path "*/browser-tour*" 2>/dev/null | sort | tail -1 || true)
  fi
  if [[ -z "$BROWSER_VIDEO" ]]; then
    echo "ERROR: No browser video found. Run 'npx playwright test' first."
    exit 1
  fi
fi

if [[ "${SKIP_NORMALIZE:-}" != "true" ]]; then
  echo "  Found: $BROWSER_VIDEO"
  mkdir -p "$SEGMENTS_DIR/normalized" "$SEGMENTS_DIR/title-cards"

  # Normalize to 1920x1080 h264
  echo "  Normalizing video..."
  ffmpeg -y -i "$BROWSER_VIDEO" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1a1a2e" \
    -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
    "$SEGMENTS_DIR/normalized/main.mp4" 2>/dev/null

  MAIN_DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SEGMENTS_DIR/normalized/main.mp4")
  echo "  Main video: ${MAIN_DUR}s"
fi
mkdir -p "$SEGMENTS_DIR/normalized" "$SEGMENTS_DIR/title-cards"

# ── Step 2: Generate title cards ───────────────────────────────────────────

echo ""
echo "Generating title cards..."

# Cold open
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=5" \
  -vf "drawtext=text='What does your AI agent actually see?':fontcolor=#cce8ff:fontsize=48:\
x=(w-text_w)/2:y=(h-text_h)/2:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/cold-open.mp4" 2>/dev/null
echo "  cold-open.mp4 (5s)"

# Closing card
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=6" \
  -vf "drawtext=text='LeftGlove + OpenClaw':fontcolor=#cce8ff:fontsize=56:\
x=(w-text_w)/2:y=(h/2)-50:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf,\
drawtext=text='Deterministic page understanding for AI agents.':fontcolor=#7799bb:fontsize=28:\
x=(w-text_w)/2:y=(h/2)+30:\
fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf" \
  -c:v libx264 -crf 18 -preset fast -r 30 -pix_fmt yuv420p -an \
  "$SEGMENTS_DIR/title-cards/closing-card.mp4" 2>/dev/null
echo "  closing-card.mp4 (6s)"

# ── Step 3: Concatenate ────────────────────────────────────────────────────

echo ""
echo "Concatenating..."

CONCAT_LIST="$SEGMENTS_DIR/concat.txt"
> "$CONCAT_LIST"

for seg in \
  "$SEGMENTS_DIR/title-cards/cold-open.mp4" \
  "$SEGMENTS_DIR/normalized/main.mp4" \
  "$SEGMENTS_DIR/title-cards/closing-card.mp4"; do
  echo "file '$(pwd)/$seg'" >> "$CONCAT_LIST"
  dur=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$seg")
  echo "  $(basename $seg): ${dur}s"
done

ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
  -c copy \
  "$SEGMENTS_DIR/final-silent.mp4" 2>/dev/null

# ── Step 4: Build voiceover audio (if manifest exists) ─────────────────────

HAS_AUDIO=false
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
CLIP_OFFSETS = f"{AUDIO_DIR}/clip_offsets.json"
SAMPLE_RATE = 44100
PAD_MS = 300
GAP_MS = 200

# Title card duration (cold-open) shifts all timing
TITLE_CARD_OFFSET_MS = 5000

if not os.path.exists(BROWSER_TIMING):
    print("WARNING: No timing.json found. Skipping voiceover.")
    sys.exit(0)

with open(BROWSER_TIMING) as f:
    timing_events = json.load(f)

with open(MANIFEST_JSON) as f:
    manifest = json.load(f)

# Load manual placement overrides if available
overrides = {}
if os.path.exists(CLIP_OFFSETS):
    with open(CLIP_OFFSETS) as f:
        overrides = json.load(f)
    print(f"Using clip_offsets.json overrides for: {', '.join(overrides.keys())}")

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
    if clip_id in overrides:
        start_ms = int(overrides[clip_id] * 1000)
        override_str = "  [override]"
    else:
        desired_ms = event["t"] + TITLE_CARD_OFFSET_MS + PAD_MS
        start_ms = max(desired_ms, prev_end_ms + GAP_MS)
        override_str = ""
    lag = start_ms - (event["t"] + TITLE_CARD_OFFSET_MS + PAD_MS)
    lag_str = f"  [{lag:+d}ms]" if lag != 0 else ""
    print(f"  t={start_ms/1000:.1f}s  {clip_id}  ({entry['duration_ms']}ms){lag_str}{override_str}")
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
    HAS_AUDIO=true
  fi
else
  echo ""
  echo "No manifest.json — skipping voiceover."
  echo "Run gen-demo-audio.py first for audio."
fi

# ── Step 5: Final assembly ─────────────────────────────────────────────────

echo ""
echo "Assembling final video..."

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ "$HAS_AUDIO" == "true" ]]; then
  ffmpeg -y \
    -i "$SEGMENTS_DIR/final-silent.mp4" \
    -i "${AUDIO_DIR}/voiceover_norm.wav" \
    -c:v libx264 -crf 18 -preset fast -movflags +faststart \
    -c:a aac -b:a 192k \
    -shortest \
    "$ROOT_DIR/demo2-final.mp4" 2>/dev/null
else
  cp "$SEGMENTS_DIR/final-silent.mp4" "$ROOT_DIR/demo2-final.mp4"
fi

# ── Step 5b: Add all fade transitions in one pass ─────────────────────────

# Three transitions, all applied in a single ffmpeg pass to avoid filter conflicts:
#   1. Opening: fade-in from dark over the cold-open title card
#   2. eBay→RC: fade-out, drawbox (hides spinner), fade-in
#   3. RC→closing: fade-out RC content, drawbox, fade-in closing card
#
# CRITICAL: no two fade filters may have overlapping enable windows, because
# each filter processes the previous filter's output — an active fade-out feeding
# into an active fade-in produces unexpected results.
if [[ -f "$TIMING_JSON" ]]; then
  echo ""
  echo "Adding fade transitions (opening + eBay→RC + closing)..."

  FILTER_CHAIN=$(python3 -c "
import json

with open('$TIMING_JSON') as f:
    timing = json.load(f)

TITLE_OFFSET = 5.0  # cold-open title card duration
MAIN_DUR = float('$MAIN_DUR')
CLOSING_START = TITLE_OFFSET + MAIN_DUR  # where closing card begins in final video

# --- Transition 1: Opening fade-in ---
# Fade from dark to title card text over first 1.2s
f1 = \"fade=t=in:st=0:d=1.2:color=0x1a1a2e:enable='between(t,0,1.5)'\"

# --- Transition 2: eBay → RC (hide spinner) ---
gen_mark = next((t for t in timing if t['id'] == 'generalize'), None)
ebay_fo_st = (gen_mark['t']/1000 + TITLE_OFFSET - 8) if gen_mark else 35.0
ebay_fi_st = ebay_fo_st + 4.6

# fade-out eBay content
f2 = f\"fade=t=out:st={ebay_fo_st}:d=1:color=0x1a1a2e:enable='between(t,{ebay_fo_st-0.5},{ebay_fo_st+1.6})'\"
# drawbox solid dark while spinner loads
f3 = f\"drawbox=x=0:y=0:w=iw:h=ih:color=0x1a1a2e@1:t=fill:enable='between(t,{ebay_fo_st+0.6},{ebay_fi_st})'\"
# fade-in RC content
f4 = f\"fade=t=in:st={ebay_fi_st}:d=1.5:color=0x1a1a2e:enable='between(t,{ebay_fi_st-0.5},{ebay_fi_st+2})'\"

# --- Transition 3: RC → closing card ---
# Fade out RC content 1.5s before closing card starts
close_fo_st = CLOSING_START - 1.5
close_fi_st = CLOSING_START + 1.0

# fade-out RC (enable ends before closing fade-in starts)
f5 = f\"fade=t=out:st={close_fo_st}:d=1.5:color=0x1a1a2e:enable='between(t,{close_fo_st-0.5},{CLOSING_START+0.5})'\"
# drawbox covers the concat boundary
f6 = f\"drawbox=x=0:y=0:w=iw:h=ih:color=0x1a1a2e@1:t=fill:enable='between(t,{CLOSING_START-0.2},{close_fi_st})'\"
# fade-in closing card text (enable starts AFTER f5 enable ends)
f7 = f\"fade=t=in:st={close_fi_st}:d=1.2:color=0x1a1a2e:enable='between(t,{CLOSING_START+0.5},{close_fi_st+1.7})'\"

# --- Transition 4: End fade-out ---
# Gentle fade to black at the very end so video doesn't hard-cut
VIDEO_END = CLOSING_START + 6.0  # closing card is 6s
end_fo_st = VIDEO_END - 1.0
f8 = f\"fade=t=out:st={end_fo_st}:d=1:color=black:enable='between(t,{end_fo_st-0.3},{VIDEO_END+0.5})'\"

chain = ','.join([f1, f2, f3, f4, f5, f6, f7, f8])
print(chain)

# Debug output to stderr
import sys
print(f'  Opening: fade-in 0-1.2s', file=sys.stderr)
print(f'  eBay→RC: fade-out {ebay_fo_st}s, dark {ebay_fo_st+0.6}-{ebay_fi_st}s, fade-in {ebay_fi_st}s', file=sys.stderr)
print(f'  Closing: fade-out {close_fo_st}s, dark {CLOSING_START-0.2}-{close_fi_st}s, fade-in {close_fi_st}s', file=sys.stderr)
print(f'  End fade-out: {end_fo_st}s', file=sys.stderr)
print(f'  Closing card starts at {CLOSING_START}s in final video', file=sys.stderr)
")

  ffmpeg -y -i "$ROOT_DIR/demo2-final.mp4" \
    -vf "$FILTER_CHAIN" \
    -c:v libx264 -crf 18 -preset fast -movflags +faststart \
    -c:a copy \
    "$ROOT_DIR/demo2-final-tmp.mp4" 2>/dev/null
  mv "$ROOT_DIR/demo2-final-tmp.mp4" "$ROOT_DIR/demo2-final.mp4"
fi

# ── Step 6: Generate and burn subtitles ────────────────────────────────────

if [[ "$HAS_AUDIO" == "true" ]] && [[ -f "$TIMING_JSON" ]]; then
  echo ""
  echo "Generating subtitles..."

  # Use whisperx-aligned subtitles if available, otherwise fall back to even-split
  if [[ -f "${AUDIO_DIR}/whisperx_per_clip.json" ]]; then
    echo "  Using whisperx word-level alignment..."
    python3 - "${AUDIO_DIR}/whisperx_per_clip.json" "subtitles.srt" <<'SUBEOF'
import json, sys

with open(sys.argv[1]) as f:
    segments = json.load(f)

def ts(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int((s % 1) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

with open(sys.argv[2], 'w') as f:
    for i, seg in enumerate(segments):
        f.write(f"{i+1}\n{ts(seg['start'])} --> {ts(seg['end'])}\n{seg['text']}\n\n")

print(f"  Generated {len(segments)} subtitle entries (whisperx-aligned)")
SUBEOF
  else
    echo "  Using even-split subtitle timing (run whisperx for better alignment)..."
    python3 - "$TIMING_JSON" "subtitles.srt" <<'SUBEOF'
import json, sys

TIMING_FILE = sys.argv[1]
SRT_OUT = sys.argv[2]
TITLE_CARD_OFFSET_MS = 5000
PAD_MS = 300
GAP_MS = 200

with open(TIMING_FILE) as f:
    timing = json.load(f)

with open("audio-clips/manifest.json") as f:
    manifest = {c["id"]: c for c in json.load(f)}

clip_starts = {}
prev_end_ms = 0
for event in timing:
    cid = event.get("clipId")
    entry = manifest.get(cid)
    if not entry or entry.get("duration_ms", 0) == 0:
        continue
    desired_ms = event["t"] + TITLE_CARD_OFFSET_MS + PAD_MS
    start_ms = max(desired_ms, prev_end_ms + GAP_MS)
    clip_starts[cid] = {"start_s": start_ms / 1000.0, "dur_s": entry["duration_ms"] / 1000.0}
    prev_end_ms = start_ms + entry["duration_ms"]

script = {
    "toddler-intro": ["This is the toddler loop.", "A human classifies elements once.", "Clickable. Readable. Typable.", "The system learns the page vocabulary."],
    "agent-sees": ["Now watch what the agent sees.", "The sieve maps every interactive element on the page."],
    "ebay-interact": ["Product titles. Listing prices. Seller ratings.", "The agent clicks through to a product, and the sieve re-maps the new page instantly."],
    "generalize": ["A completely different site.", "A state park reservation system.", "The sieve maps it just the same.", "Any site. Any layout.", "Zero retraining."],
    "closing": ["The sieve sees the page.", "The glossary names every element.", "Your agent knows what to click, what to read, what to compare."],
}

def ts(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int((s % 1) * 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

subs = []
idx = 1
for cid, info in clip_starts.items():
    lines = script.get(cid, [])
    if not lines:
        continue
    line_dur = info["dur_s"] / len(lines)
    for i, line in enumerate(lines):
        ls = info["start_s"] + i * line_dur
        le = info["start_s"] + (i + 1) * line_dur
        subs.append((idx, ls, le, line))
        idx += 1

with open(SRT_OUT, "w") as f:
    for i, start, end, text in subs:
        f.write(f"{i}\n{ts(start)} --> {ts(end)}\n{text}\n\n")

print(f"  Generated {len(subs)} subtitle entries (even-split)")
SUBEOF
  fi

  if [[ -f "subtitles.srt" ]]; then
    echo "  Burning subtitles into video..."
    ffmpeg -y -i "$ROOT_DIR/demo2-final.mp4" \
      -vf "subtitles=subtitles.srt:force_style='FontSize=22,FontName=DejaVu Sans,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=40'" \
      -c:v libx264 -crf 18 -preset fast -movflags +faststart \
      -c:a copy \
      "$ROOT_DIR/demo2-final-subs.mp4" 2>/dev/null
    echo "  Subtitled version: $ROOT_DIR/demo2-final-subs.mp4"
  fi
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
