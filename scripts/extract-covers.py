#!/usr/bin/env python3
"""Extract album art from MP3 files and update music.json with cover paths."""

import json
import os
import hashlib
from mutagen.id3 import ID3

# Determine script directory and project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

MUSIC_JSON = os.path.join(PROJECT_ROOT, "data", "music.json")
COVERS_DIR = os.path.join(PROJECT_ROOT, "covers")

os.makedirs(COVERS_DIR, exist_ok=True)

with open(MUSIC_JSON, "r", encoding="utf-8") as f:
    songs = json.load(f)

updated = 0
for song in songs:
    rel_mp3_path = song.get("file", "")
    if not rel_mp3_path:
        print(f"Skipping: No file path defined for ID: {song['id']} ({song['title']})")
        continue
    
    mp3_path = os.path.join(PROJECT_ROOT, rel_mp3_path)
    if not os.path.exists(mp3_path):
        print(f"Skipping: File not found: {mp3_path} (ID: {song['id']})")
        continue

    try:
        tags = ID3(mp3_path)
    except Exception as e:
        print(f"Skipping: Could not read ID3 tags for {mp3_path}. Error: {e}")
        continue

    apic_keys = [k for k in tags.keys() if k.startswith("APIC")]
    if not apic_keys:
        print(f"Skipping: No album art found in {mp3_path}")
        continue

    apic = tags[apic_keys[0]]
    img_data = apic.data
    mime = apic.mime

    ext = "jpg" if "jpeg" in mime or "jpg" in mime else "png"

    # Use song id for filename to keep it stable
    cover_filename = f"{song['id']}.{ext}"
    cover_path = os.path.join(COVERS_DIR, cover_filename)

    with open(cover_path, "wb") as img_file:
        img_file.write(img_data)

    song["cover"] = f"covers/{cover_filename}"
    updated += 1

with open(MUSIC_JSON, "w", encoding="utf-8") as f:
    json.dump(songs, f, indent=2, ensure_ascii=False)

print(f"Extracted {updated} covers out of {len(songs)} tracks")
