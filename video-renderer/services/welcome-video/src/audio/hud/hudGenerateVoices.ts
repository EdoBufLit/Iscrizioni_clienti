import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../../env";
import { synthesizeSpeech } from "../../elevenlabs";

const HUD_WELCOME_LINE = "Registrazione completata. Benvenuta in Àssonam.";

export type HudGeneratedVoices = {
  outputDir: string;
  welcomeFile: string;
};

export const hudGenerateVoices = async (orgId: string): Promise<HudGeneratedVoices> => {
  const env = getEnv();
  if (!env.elevenLabsApiKey) {
    throw new Error(
      "Missing required environment variable: ELEVENLABS_API_KEY (required when AUDIO_SOURCE=elevenlabs).",
    );
  }
  if (env.elevenLabsVoiceIds.length === 0) {
    throw new Error(
      "Missing required environment variable: ELEVENLABS_VOICE_IDS (required when AUDIO_SOURCE=elevenlabs).",
    );
  }
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
