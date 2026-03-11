import json

json_path = r"c:\Users\phili\OneDrive\Desktop\risk_vector\Portal-Music\data\music.json"
targets = ["Over Night", "Back Of My Mind", "I Blinked and You Were Gone", "Edge of the Fallen Sun", "Dark Rider"]

with open(json_path, 'r', encoding='utf-8') as f:
    songs = json.load(f)

for song in songs:
    if any(t.lower() in song['title'].lower() for t in targets):
        song['featured'] = True
    else:
        song['featured'] = False # Ensure only these are featured

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(songs, f, indent=2, ensure_ascii=False)

print("Updated featured tracks in music.json")
