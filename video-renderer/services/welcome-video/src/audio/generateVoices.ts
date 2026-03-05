import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../env";
import { synthesizeSpeech } from "../elevenlabs";

const VOICE_LINES = [
  "ASSONAM è",
  "ASSONAM è comunità",
  "ASSONAM è futuro",
  "ASSONAM è digitale",
  "ASSONAM è semplice",
] as const;

const WELCOME_LINE = "Benvenuto in ASSONAM";

export type GeneratedVoices = {
  outputDir: string;
  voiceFiles: string[];
  welcomeFile: string;
};

export const generateVoices = async (): Promise<GeneratedVoices> => {
  const env = getEnv();
  const outputDir = path.resolve(process.cwd(), "tmp", "voices");
  await fs.mkdir(outputDir, { recursive: true });

  const voiceFiles: string[] = [];

  for (let index = 0; index < VOICE_LINES.length; index += 1) {
    const text = VOICE_LINES[index];
    const voiceId = env.elevenLabsVoiceIds[index % env.elevenLabsVoiceIds.length];
    const audioBuffer = await synthesizeSpeech({ voiceId, text });
    const outputPath = path.join(outputDir, `voice_${index + 1}.mp3`);
    await fs.writeFile(outputPath, audioBuffer);
    voiceFiles.push(outputPath);
  }

  const welcomeVoiceId =
    env.elevenLabsVoiceIds.length > VOICE_LINES.length
      ? env.elevenLabsVoiceIds[VOICE_LINES.length]
      : env.elevenLabsVoiceIds[0];

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
