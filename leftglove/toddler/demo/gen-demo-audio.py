#!/usr/bin/env python3
"""
Generate spoken audio clips for the LeftGlove demo video.

Uses Fish Speech S1-mini with rhobotmeat.wav as the reference voice.
Reads narration script from demo-script.json.
Outputs WAV files + a JSON manifest with durations.

Skips clips whose text hasn't changed since last run.
Use --force to regenerate all clips.

Usage:
    cd /home/login/PycharmProjects/chat_reader_zonos
    source .venv/bin/activate
    python /home/login/PycharmProjects/gauntlet/leftglove/leftglove/toddler/demo/gen-demo-audio.py

    # Force-regenerate all:
    python .../gen-demo-audio.py --force
"""

import json
import sys
import wave
import argparse
from pathlib import Path

ZONOS_DIR = Path("/home/login/PycharmProjects/chat_reader_zonos")
sys.path.insert(0, str(ZONOS_DIR))

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "audio-clips"
SCRIPT_JSON = SCRIPT_DIR / "demo-script.json"
VOICE_PATH = str(ZONOS_DIR / "voices" / "rhobotmeat.wav")


def get_wav_duration_ms(path: Path) -> int:
    with wave.open(str(path), 'rb') as wf:
        return int(wf.getnframes() / wf.getframerate() * 1000)


TAIL_SILENCE_MS = 700  # prevent Fish Speech from clipping the last word


def save_wav(audio_np, sample_rate: int, path: Path):
    import numpy as np
    audio_int16 = (np.clip(audio_np, -1.0, 1.0) * 32767).astype(np.int16)
    silence = np.zeros(int(sample_rate * TAIL_SILENCE_MS / 1000), dtype=np.int16)
    padded = np.concatenate([audio_int16, silence])
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(padded.tobytes())


def load_manifest_texts(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {}
    with open(manifest_path) as f:
        data = json.load(f)
    return {c["id"]: c.get("text", "") for c in data}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate all clips")
    args = parser.parse_args()

    with open(SCRIPT_JSON) as f:
        script = json.load(f)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT_DIR / "manifest.json"
    existing_texts = load_manifest_texts(manifest_path)

    print(f"Script: {SCRIPT_JSON} ({len(script)} clips)")
    print("Loading Fish Speech backend...")
    from fish_speech_backend import FishSpeechBackend
    backend = FishSpeechBackend(
        checkpoint_path=str(ZONOS_DIR / "checkpoints" / "openaudio-s1-mini"),
        device="cuda",
        compile=False,
    )
    backend.load()
    print(f"Backend loaded. Processing {len(script)} clips...\n")

    manifest = []
    regenerated = 0
    skipped = 0

    for i, entry in enumerate(script):
        clip_id = entry["id"]
        dialog = entry["spoken"]
        out_path = OUTPUT_DIR / f"{clip_id}.wav"

        if dialog.strip().upper().startswith("NIX"):
            print(f"  [{i+1:02d}/{len(script)}] {clip_id}: skip (NIX)")
            if out_path.exists():
                out_path.unlink()
            continue

        text_changed = existing_texts.get(clip_id, "") != dialog
        needs_gen = args.force or not out_path.exists() or text_changed

        if not needs_gen:
            duration_ms = get_wav_duration_ms(out_path)
            print(f"  [{i+1:02d}/{len(script)}] {clip_id}: skip ({duration_ms}ms)")
            manifest.append({"id": clip_id, "path": str(out_path), "duration_ms": duration_ms, "text": dialog})
            skipped += 1
            continue

        reason = "forced" if args.force else ("new" if not out_path.exists() else "text changed")
        if out_path.exists():
            out_path.unlink()

        print(f"  [{i+1:02d}/{len(script)}] {clip_id}: generating ({reason})...", end='', flush=True)
        try:
            result = backend.synthesize(dialog, VOICE_PATH)
            save_wav(result.audio, result.sample_rate, out_path)
            duration_ms = get_wav_duration_ms(out_path)
            print(f" {duration_ms}ms")
            manifest.append({"id": clip_id, "path": str(out_path), "duration_ms": duration_ms, "text": dialog})
            regenerated += 1
        except Exception as e:
            print(f" ERROR: {e}")
            manifest.append({"id": clip_id, "path": str(out_path), "duration_ms": 0, "error": str(e), "text": dialog})

    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    total_ms = sum(c.get("duration_ms", 0) for c in manifest)
    print(f"\nDone: {regenerated} generated, {skipped} unchanged")
    print(f"Total audio duration: {total_ms/1000:.1f}s")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
