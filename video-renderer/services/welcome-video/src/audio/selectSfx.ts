import fs from "node:fs/promises";
import path from "node:path";

export type SfxSelections = {
  impact: string;
  rise: string;
  whoosh: string;
  sparkle: string;
  ambience: string;
};

export const selectSfx = async (assetsDir: string): Promise<SfxSelections> => {
  const categories = ["impact", "rise", "whoosh", "sparkle", "ambience"] as const;
  const selections: Partial<SfxSelections> = {};

  for (const category of categories) {
    const dirPath = path.join(assetsDir, "sfx", category);
    try {
      const files = await fs.readdir(dirPath);
      const audioFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
      
      if (audioFiles.length === 0) {
        throw new Error(`No audio files found in ${dirPath}`);
      }
      
      const randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
      selections[category] = path.join(dirPath, randomFile);
    } catch (error) {
      throw new Error(`Failed to load sfx for category ${category}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("SFX selected:", selections);
  return selections as SfxSelections;
};
