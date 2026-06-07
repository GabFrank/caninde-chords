import JSZip from 'jszip';
import { Song, Setlist } from '../types';

export interface OpenSongImportResult {
  songs: Partial<Song>[];
  setlists?: Partial<Setlist>[];
  errors: string[];
}

const parseOpenSongXml = (xmlString: string): Partial<Song> | null => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    // Basic validation
    const songNode = xmlDoc.getElementsByTagName('song')[0];
    if (!songNode) return null;

    const title = xmlDoc.getElementsByTagName('title')[0]?.textContent || 'Untitled Import';
    const artist = xmlDoc.getElementsByTagName('author')[0]?.textContent || '';
    const rawLyrics = xmlDoc.getElementsByTagName('lyrics')[0]?.textContent || '';

    // OpenSong format to our format:
    // OpenSong often uses lines starting with '.' for chords
    // Example:
    // .G       C
    // Lyrics here
    // We want: [G]Lyrics [C]here
    
    const lines = rawLyrics.split('\n');
    let processedContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // If it's a chord line (starts with .)
      if (line.startsWith('.')) {
        const chordLine = line.substring(1);
        const nextLine = lines[i + 1] || '';
        
        // If next line is not a chord line, merge them
        if (!nextLine.startsWith('.')) {
          let mergedLine = '';
          let lastPos = 0;
          
          // Find chords and their positions
          const chords: { chord: string, pos: number }[] = [];
          let currentChord = '';
          let currentPos = -1;
          
          for (let j = 0; j < chordLine.length; j++) {
            if (chordLine[j] !== ' ') {
              if (currentPos === -1) currentPos = j;
              currentChord += chordLine[j];
            } else if (currentPos !== -1) {
              chords.push({ chord: currentChord, pos: currentPos });
              currentChord = '';
              currentPos = -1;
            }
          }
          if (currentPos !== -1) chords.push({ chord: currentChord, pos: currentPos });
          
          // Sort chords by position descending to insert from back to front
          chords.sort((a, b) => b.pos - a.pos);
          
          let textLine = nextLine;
          // Pad text line if it's shorter than the last chord position
          const maxPos = chords.length > 0 ? chords[0].pos : 0;
          if (textLine.length < maxPos) {
            textLine = textLine.padEnd(maxPos + 1, ' ');
          }
          
          let resultLine = textLine;
          for (const { chord, pos } of chords) {
            resultLine = resultLine.slice(0, pos) + `[${chord}]` + resultLine.slice(pos);
          }
          
          processedContent += resultLine + '\n';
          i++; // Skip next line as we merged it
        } else {
          // Just chords, no text? (Maybe a bridge or intro)
          // Convert to [Chord] format
          const chords = line.substring(1).trim().split(/\s+/);
          processedContent += chords.map(c => `[${c}]`).join(' ') + '\n';
        }
      } else {
        // Regular line (lyrics or section header)
        processedContent += line + '\n';
      }
    }

    return {
      title,
      artist,
      content: processedContent.trim(),
      key: xmlDoc.getElementsByTagName('key')[0]?.textContent || '',
      tempo: xmlDoc.getElementsByTagName('tempo')[0]?.textContent || '',
    };
  } catch (e) {
    console.error('Error parsing OpenSong XML:', e);
    return null;
  }
};

export const importOpenSongFile = async (file: File): Promise<OpenSongImportResult> => {
  const result: OpenSongImportResult = {
    songs: [],
    errors: []
  };

  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'ost') {
    // Single song file (XML)
    const text = await file.text();
    const song = parseOpenSongXml(text);
    if (song) {
      result.songs.push(song);
    } else {
      result.errors.push(`Could not parse ${file.name}`);
    }
  } else if (extension === 'osb') {
    // Could be our JSON backup or an OpenSong ZIP backup
    try {
      const text = await file.text();
      // Try parsing as JSON first
      try {
        const jsonData = JSON.parse(text);
        if (jsonData.songs && Array.isArray(jsonData.songs)) {
          result.songs = [...result.songs, ...jsonData.songs];
          if (jsonData.setlists && Array.isArray(jsonData.setlists)) {
            result.setlists = jsonData.setlists;
          }
          return result;
        }
      } catch (jsonErr) {
        // Not JSON, continue to ZIP attempt
      }

      // Backup file (ZIP)
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      
      for (const [filename, zipEntry] of Object.entries(contents.files)) {
        if (!zipEntry.dir) {
          const text = await zipEntry.async('text');
          const song = parseOpenSongXml(text);
          if (song) {
            result.songs.push(song);
          }
        }
      }
    } catch (e) {
      result.errors.push(`Error reading backup file ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    result.errors.push(`Unsupported file extension: .${extension}`);
  }

  return result;
};
