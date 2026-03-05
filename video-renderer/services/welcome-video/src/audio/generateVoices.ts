import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../env";
import { synthesizeSpeech } from "../elevenlabs";

const VOICE_LINES = [
  "Àssonam è",
  "comunità",
  "digitale",
  "futuro",
  "semplice",
] as const;

const WELCOME_LINE = "Benvenuto in Àssonam";

export type GeneratedVoices = {
  outputDir: string;
  voiceFiles: string[];
  welcomeFile: string;
};

export const generateVoices = async (orgId: string): Promise<GeneratedVoices> => {
  const env = getEnv();
  const outputDir = path.resolve(process.cwd(), ".tmp", orgId, "voices");
  await fs.mkdir(outputDir, { recursive: true });

  const voiceFiles: string[] = [];

  for (let index = 0; index < VOICE_LINES.length; index += 1) {
    const text = VOICE_LINES[index];
    const voiceId = env.elevenLabsVoiceIds[index % env.elevenLabsVoiceIds.length];
    const audioBuffer = await synthesizeSpeech({ voiceId, text });
    const outputPath = path.join(outputDir, `v${index + 1}.mp3`);
    await fs.writeFile(outputPath, audioBuffer);
    voiceFiles.push(outputPath);
  }

  const welcomeVoiceId = env.elevenLabsVoiceIds[0];

  const welcomeAudio = await synthesizeSpeech({
    voiceId: welcomeVoiceId,
    text: WELCOME_LINE,
  });

  const welcomeFile = path.join(outputDir, "welcome.mp3");
  await fs.writeFile(welcomeFile, welcomeAudio);

  return {
    outputDir,
    voiceFiles,
    welcomeFile,
  };
};
