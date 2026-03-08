const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('data/music.json','utf8'));

const FOLDER_TO_PARENT = {
  'Rock':'Rock', 'Hard Rock':'Rock', 'Hair Metal':'Rock', 'Cinematic Rock':'Rock',
  'Calm Jazz':'Jazz', 'Fast Jazz':'Jazz',
  'Hiphop':'Hip-Hop',
  'Techno-Wave':'Electronic', 'Chillhop':'Electronic',
  'Cinematic':'Cinematic', 'Dramatic':'Cinematic',
  'Classical':'Classical', 'Romantic':'Classical',
  'Country':'Country & Folk', 'Bluegrass':'Country & Folk',
  'Peaceful':'Ambient & Chill', 'Meditative':'Ambient & Chill', 'Uplifting':'Ambient & Chill',
  'Horror':'Dark & Suspense', 'Suspenseful':'Dark & Suspense', 'Unsettling':'Dark & Suspense',
  'Playful':'Playful & Mood', 'Sad':'Playful & Mood'
};

const ARTIST_FOLDERS = ['Avilyn Grace', 'Dem Bois'];

let updated = 0;
catalog.forEach(entry => {
  const parts = entry.file.split('/');
  const folder = parts[1];

  if (ARTIST_FOLDERS.includes(folder)) {
    entry.artist = entry.artist || folder;
    if (entry.genre === '' || entry.genre === folder) entry.genre = '';
    if (entry.subgenre === '' || entry.subgenre === undefined) entry.subgenre = folder;
  } else if (FOLDER_TO_PARENT[folder]) {
    const newGenre = FOLDER_TO_PARENT[folder];
    if (entry.genre !== newGenre) {
      entry.genre = newGenre;
      updated++;
    }
    if (entry.subgenre === '' || entry.subgenre === undefined || entry.subgenre === entry.genre) {
      entry.subgenre = folder;
    }
  }
});

fs.writeFileSync('data/music.json', JSON.stringify(catalog, null, 2));
console.log('Updated ' + updated + ' genre assignments. Total: ' + catalog.length);
