#!/usr/bin/env python3
"""Extract album art from MP3 files and update music.json with cover paths."""

import json
import os
import hashlib
from mutagen.id3 import ID3

MUSIC_JSON = "data/music.json"
COVERS_DIR = "covers"

os.makedirs(COVERS_DIR, exist_ok=True)

with open(MUSIC_JSON, "r") as f:
    songs = json.load(f)

updated = 0
for song in songs:
    mp3_path = song.get("file", "")
    if not mp3_path or not os.path.exists(mp3_path):
        continue

    try:
        tags = ID3(mp3_path)
    except Exception:
        continue

    apic_keys = [k for k in tags.keys() if k.startswith("APIC")]
    if not apic_keys:
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

    song["cover"] = cover_path
    updated += 1

with open(MUSIC_JSON, "w") as f:
    json.dump(songs, f, indent=2)

print(f"Extracted {updated} covers out of {len(songs)} tracks")
