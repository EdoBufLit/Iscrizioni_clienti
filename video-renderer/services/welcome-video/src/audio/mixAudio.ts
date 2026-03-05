import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../env";
import { selectSfx } from "./selectSfx";

export type MixAudioInput = {
  voiceFiles: string[];
  welcomeFile: string;
};

export type MixedAudio = {
  outputPath: string;
};

const assertFileExists = async (filePath: string): Promise<void> => {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing required file: ${filePath}`);
  }
};

const runFfmpeg = async (args: string[]): Promise<void> => {
  const env = getEnv();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.ffmpegBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg exited with code ${code}.\n${stderr}`));
    });
  });
};

export const mixAudio = async ({
  voiceFiles,
  welcomeFile,
}: MixAudioInput): Promise<MixedAudio> => {
  if (voiceFiles.length !== 5) {
    throw new Error(`Expected exactly 5 voice files, received ${voiceFiles.length}.`);
  }

  const assetsDir = path.resolve(process.cwd(), "assets");
  const publicDir = path.resolve(process.cwd(), "public");
  await fs.mkdir(publicDir, { recursive: true });

  const sfx = await selectSfx(assetsDir);

  const sources = [
    ...voiceFiles,
    sfx.ambience,
    sfx.rise,
    sfx.impact,
    welcomeFile,
    sfx.whoosh,
    sfx.sparkle,
  ];

  await Promise.all(sources.map((source) => assertFileExists(source)));

  const filterComplex = [
    "[0:a]adelay=0|0,volume=1.1[a0]",
    "[1:a]adelay=200|200,volume=1.1[a1]",
    "[2:a]adelay=400|400,volume=1.1[a2]",
    "[3:a]adelay=600|600,volume=1.1[a3]",
    "[4:a]adelay=800|800,volume=1.1[a4]",
    "[5:a]adelay=0|0,volume=0.5[a5]",          // ambience at 0ms
    "[6:a]adelay=0|0,volume=0.6[a6]",          // rise at 0ms
    "[7:a]adelay=3900|3900,volume=1.0[a7]",    // impact syncs with flash ~120 frames (4000ms, slightly anticipatory)
    "[8:a]adelay=5000|5000,volume=1.15[a8]",   // welcomeFile
    "[9:a]adelay=7800|7800,volume=0.9[a9]",    // whoosh syncs with logo reveal (frame 240 = 8000ms)
    "[10:a]adelay=8500|8500,volume=0.85[a10]", // sparkle after logo reveal
    "[a0][a1][a2][a3][a4][a5][a6][a7][a8][a9][a10]amix=inputs=11:duration=longest:normalize=0,alimiter=limit=0.95,aformat=sample_rates=48000:channel_layouts=stereo[mix]",
  ].join(";");

  const outputPath = path.join(publicDir, "welcome_audio.wav");
  const args = [
    "-y",
    ...sources.flatMap((source) => ["-i", source]),
    "-filter_complex",
    filterComplex,
    "-map",
    "[mix]",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    "15",
    outputPath,
  ];

  await runFfmpeg(args);

  return { outputPath };
};
