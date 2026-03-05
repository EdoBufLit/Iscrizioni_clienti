import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../../env";
import { synthesizeSpeech } from "../../elevenlabs";

const HUD_WELCOME_LINE = "Registrazione completata. Benvenuta in ASSONAM.";

export type HudGeneratedVoices = {
  outputDir: string;
  welcomeFile: string;
};

export const hudGenerateVoices = async (orgId: string): Promise<HudGeneratedVoices> => {
  const env = getEnv();
  const outputDir = path.resolve(process.cwd(), ".tmp", orgId, "voices_hud");
  await fs.mkdir(outputDir, { recursive: true });

  const welcomeVoiceId = env.elevenLabsVoiceIds[0];

  const welcomeAudio = await synthesizeSpeech({
    voiceId: welcomeVoiceId,
    text: HUD_WELCOME_LINE,
  });

  const welcomeFile = path.join(outputDir, "welcome_hud.mp3");
  await fs.writeFile(welcomeFile, welcomeAudio);

  return {
    outputDir,
    welcomeFile,
  };
};
