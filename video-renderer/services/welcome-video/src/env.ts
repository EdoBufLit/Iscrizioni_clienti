import path from "node:path";
import dotenv from "dotenv";

const REQUIRED_ENV = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_IDS"] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

export type AppEnv = {
  elevenLabsApiKey: string;
  elevenLabsVoiceIds: string[];
  elevenLabsModelId: string;
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

const readRequiredEnv = (key: RequiredEnvKey): string => {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
};

const parseVoiceIds = (rawVoiceIds: string): string[] => {
  const voiceIds = rawVoiceIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (voiceIds.length === 0) {
    throw new Error("ELEVENLABS_VOICE_IDS must contain at least one voice ID.");
  }

  return voiceIds;
};

export const getEnv = (): AppEnv => {
  loadDotEnv();

  if (cachedEnv) {
    return cachedEnv;
  }

  for (const key of REQUIRED_ENV) {
    readRequiredEnv(key);
  }

  cachedEnv = {
    elevenLabsApiKey: readRequiredEnv("ELEVENLABS_API_KEY"),
    elevenLabsVoiceIds: parseVoiceIds(readRequiredEnv("ELEVENLABS_VOICE_IDS")),
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_v3",
    outputPath: path.resolve(process.env.WELCOME_VIDEO_OUTPUT_PATH || "/tmp/assonam_welcome.mp4"),
    storageRootDir: path.resolve(process.env.WELCOME_VIDEO_STORAGE_DIR || "/tmp/storage"),
    publicBaseUrl: process.env.WELCOME_VIDEO_PUBLIC_BASE_URL?.trim() || null,
    orgId: process.env.ORG_ID?.trim() || null,
    ffmpegBinary: process.env.FFMPEG_BIN?.trim() || "ffmpeg",
  };

  return cachedEnv;
};
