import fs from "node:fs/promises";
import path from "node:path";

// Generate a 32-bit seed from a string
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
}

// Mulberry32 RNG
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export type HudSfxSelection = {
  ambience: { path: string; name: string };
  beep: { path: string; name: string };
  whoosh: { path: string; name: string };
  impact: { path: string; name: string };
  typing: { path: string; name: string };
};

export const hudSelectSfx = async (assetsDir: string, seed: string): Promise<HudSfxSelection> => {
  const seedFunc = xmur3(seed);
  const rand = mulberry32(seedFunc());

  const categories = ["ambience", "beep", "whoosh", "impact", "typing"] as const;
  const selections: Partial<HudSfxSelection> = {};

  for (const category of categories) {
    const dirPath = path.join(assetsDir, "sfx", category);
    try {
      const files = await fs.readdir(dirPath);
      const audioFiles = files.filter(f => f.toLowerCase().endsWith('.mp3'));
      
      if (audioFiles.length === 0) {
        throw new Error(`SFX folder is empty: ${dirPath} (needs at least 1 .mp3)`);
      }
      
      audioFiles.sort();
      
      const selectedIndex = Math.floor(rand() * audioFiles.length);
      const randomFile = audioFiles[selectedIndex];
      
      selections[category] = {
        path: path.join(dirPath, randomFile),
        name: randomFile
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`SFX folder missing: ${dirPath}`);
      }
      throw new Error(`Failed to load sfx for category ${category}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return selections as HudSfxSelection;
};
