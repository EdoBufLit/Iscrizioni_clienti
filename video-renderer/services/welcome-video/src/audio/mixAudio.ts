import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../env";
import { SfxSelection } from "./selectSfx";

export type MixAudioInput = {
  voiceFiles: string[];
  welcomeFile: string;
  sfx: SfxSelection;
  orgId: string;
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

const convertToWav = async (inputPath: string, outputDir: string): Promise<string> => {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}_converted.wav`);
  await runFfmpeg([
    "-y",
    "-i", inputPath,
    "-ar", "48000",
    "-ac", "2",
    outputPath
  ]);
  return outputPath;
};

export const mixAudio = async ({
  voiceFiles,
  welcomeFile,
  sfx,
  orgId
}: MixAudioInput): Promise<MixedAudio> => {
  if (voiceFiles.length !== 5) {
    throw new Error(`Expected exactly 5 voice files, received ${voiceFiles.length}.`);
  }

  const tmpWavDir = path.resolve(process.cwd(), ".tmp", orgId, "wav");
  await fs.mkdir(tmpWavDir, { recursive: true });

  const publicDir = path.resolve(process.cwd(), "public");
  await fs.mkdir(publicDir, { recursive: true });

  // Convert all to WAV
  const [
    v1, v2, v3, v4, v5,
    welcome,
    ambience,
    rise,
    impact,
    whoosh,
    sparkle
  ] = await Promise.all([
    ...voiceFiles.map(f => convertToWav(f, tmpWavDir)),
    convertToWav(welcomeFile, tmpWavDir),
    convertToWav(sfx.ambience.path, tmpWavDir),
    convertToWav(sfx.rise.path, tmpWavDir),
    convertToWav(sfx.impact.path, tmpWavDir),
    convertToWav(sfx.whoosh.path, tmpWavDir),
    convertToWav(sfx.sparkle.path, tmpWavDir),
  ]);

  const sources = [
    v1, v2, v3, v4, v5,
    welcome,
    ambience,
    rise,
    impact,
    whoosh,
    sparkle
  ];

  await Promise.all(sources.map((source) => assertFileExists(source)));

  // Timeline (target ~11s):
  // 0.0s ambience (low volume, under all) 0.12
  // 0.0s rise (low-mid volume) 0.35
  // 0.6s v1 "ASSONAM è" 1.00
  // 2.0s v2 "comunità" 1.00
  // 2.7s v3 "digitale" 1.00
  // 3.4s v4 "futuro" 1.00
  // 4.1s v5 "semplice" 1.00
  // 5.2s impact (strong) 0.90
  // 6.0s welcome voice 1.00
  // 7.0s whoosh (subtle) 0.40
  // 7.2s sparkle (very subtle) 0.35

  const filterComplex = [
    // Create a silence track to ensure base length and format
    "anullsrc=r=48000:cl=stereo,atrim=0:11[silence]",
    "[0:a]volume=1.0,adelay=600|600[a0]",
    "[1:a]volume=1.0,adelay=2000|2000[a1]",
    "[2:a]volume=1.0,adelay=2700|2700[a2]",
    "[3:a]volume=1.0,adelay=3400|3400[a3]",
    "[4:a]volume=1.0,adelay=4100|4100[a4]",
    "[5:a]volume=1.0,adelay=6000|6000[a5]",
    "[6:a]volume=0.12,adelay=0|0[a6]",
    "[7:a]volume=0.35,adelay=0|0[a7]",
    "[8:a]volume=0.90,adelay=5200|5200[a8]",
    "[9:a]volume=0.40,adelay=7000|7000[a9]",
    "[10:a]volume=0.35,adelay=7200|7200[a10]",
    "[silence][a0][a1][a2][a3][a4][a5][a6][a7][a8][a9][a10]amix=inputs=12:duration=first:dropout_transition=2,alimiter=limit=0.95:level_in=1:level_out=1[mix]"
  ].join(";");

  const outputPath = path.join(publicDir, "welcome_audio.wav");
  const args = [
    "-y",
    ...sources.flatMap((source) => ["-i", source]),
    "-filter_complex", filterComplex,
    "-map", "[mix]",
    "-ar", "48000",
    "-ac", "2",
    "-t", "11",
    outputPath,
  ];

  await runFfmpeg(args);

  return { outputPath };
};
