Build a lightweight static music download website.

Requirements:

The site will host free AI-generated music for creators to download and use in videos, podcasts, and projects.

Tech constraints:
- Must run on GitHub Pages
- HTML, CSS, and Vanilla JavaScript only
- No frameworks
- Fast loading and minimal code

Features:

1. Homepage
- search bar
- category navigation
- featured tracks

2. Music browser
- load songs from a JSON file
- show title, category, tags
- play preview button
- download button

3. Music player
- play/pause
- progress bar
- simple UI

4. Search system
- client-side search
- filter by tags, category, title

5. Recently played
- store in localStorage
- show last 10 songs

6. Theme system
- light
- dark
- sepia
- saved in localStorage

7. Download flow
- clicking download opens an ad/interstitial page
- after a delay allow MP3 download

8. File system
Music stored like:

/music/category/song.mp3

Metadata stored in:

/data/music.json

9. Easy expansion

Adding music should only require:
- placing mp3 in folder
- adding entry to JSON file

10. Pages

index.html
browse.html
search.html
license.html

Design goals:

- clean
- minimal
- creator focused
- fast loading
- mobile friendly

Generate:
- full folder structure
- HTML
- CSS
- JavaScript