import path from "node:path";
import dotenv from "dotenv";

export type AppEnv = {
  elevenLabsApiKey: string;
  elevenLabsVoiceIds: string[];
  elevenLabsModelId: string;
  audioSource: "local" | "elevenlabs";
  audioLocalPath: string;
  outputPath: string;
  storageRootDir: string;
  publicBaseUrl: string | null;
  orgId: string | null;
  ffmpegBinary: string;
};

let cachedEnv: AppEnv | null = null;
let dotenvLoaded = false;

const loadDotEnv = (): void => {
  if (dotenvLoaded) {
    return;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];

  for (const envPath of candidatePaths) {
    dotenv.config({ path: envPath, override: false });
  }

  dotenvLoaded = true;
};

const parseVoiceIds = (rawVoiceIds: string | undefined): string[] => {
  if (!rawVoiceIds || !rawVoiceIds.trim()) {
    return [];
  }
  const voiceIds = rawVoiceIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return voiceIds;
};

const parseAudioSource = (rawSource: string | undefined): "local" | "elevenlabs" => {
  const normalized = String(rawSource || "").trim().toLowerCase();
  if (normalized === "elevenlabs") {
    return "elevenlabs";
  }
  return "local";
};

export const getEnv = (): AppEnv => {
  loadDotEnv();

  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = {
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || "",
    elevenLabsVoiceIds: parseVoiceIds(process.env.ELEVENLABS_VOICE_IDS),
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_v3",
    audioSource: parseAudioSource(process.env.AUDIO_SOURCE),
    audioLocalPath: path.resolve(
      process.env.AUDIO_LOCAL_PATH || path.join(process.cwd(), "assets", "audio"),
    ),
    outputPath: path.resolve(process.env.WELCOME_VIDEO_OUTPUT_PATH || "/tmp/assonam_welcome.mp4"),
    storageRootDir: path.resolve(process.env.WELCOME_VIDEO_STORAGE_DIR || "/tmp/storage"),
    publicBaseUrl: process.env.WELCOME_VIDEO_PUBLIC_BASE_URL?.trim() || null,
    orgId: process.env.ORG_ID?.trim() || null,
    ffmpegBinary: process.env.FFMPEG_BIN?.trim() || "ffmpeg",
  };

  return cachedEnv;
};
