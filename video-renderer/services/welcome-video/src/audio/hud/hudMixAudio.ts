import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "../../env";
import { HudSfxSelection } from "./hudSelectSfx";

export type HudMixAudioInput = {
  welcomeFile: string;
  sfx: HudSfxSelection;
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

export const hudMixAudio = async ({
  welcomeFile,
  sfx,
  orgId
}: HudMixAudioInput): Promise<MixedAudio> => {

  const tmpWavDir = path.resolve(process.cwd(), ".tmp", orgId, "wav_hud");
  await fs.mkdir(tmpWavDir, { recursive: true });

  const publicDir = path.resolve(process.cwd(), "public");
  await fs.mkdir(publicDir, { recursive: true });

  // Convert all to WAV
  const [
    welcome,
    ambience,
    beep,
    whoosh,
    impact,
  ] = await Promise.all([
    convertToWav(welcomeFile, tmpWavDir),
    convertToWav(sfx.ambience.path, tmpWavDir),
    convertToWav(sfx.beep.path, tmpWavDir),
    convertToWav(sfx.whoosh.path, tmpWavDir),
    convertToWav(sfx.impact.path, tmpWavDir),
  ]);

  const sources = [
    welcome,
    ambience,
    beep,
    whoosh,
    impact,
  ];

  await Promise.all(sources.map((source) => assertFileExists(source)));

  // Timeline (10s total duration):
  // ambience under entire video (0.0s)
  // whoosh at Scene 2 transition: 1.5s (1500ms)
  // beep at Status Verified (frame 70): 2.33s (2333ms)
  // whoosh at Scene 3 transition: 3.0s (3000ms)
  // impact at Registration Complete (frame 135): 4.5s (4500ms)
  // voice at Logo Reveal (frame 165): 5.5s (5500ms)

  const filterComplex = [
    // Create a silence track to ensure base length and format
    "anullsrc=r=48000:cl=stereo,atrim=0:10[silence]",
    "[0:a]volume=1.0,adelay=5500|5500[a0]",          // welcome
    "[1:a]volume=0.15,adelay=0|0[a1]",               // ambience
    "[2:a]volume=0.4,adelay=2333|2333[a2]",          // beep
    "[3:a]volume=0.35,adelay=1500|1500[a3_1]",       // whoosh 1
    "[3:a]volume=0.35,adelay=3000|3000[a3_2]",       // whoosh 2
    "[4:a]volume=0.9,adelay=4500|4500[a4]",          // impact
    "[silence][a0][a1][a2][a3_1][a3_2][a4]amix=inputs=7:duration=first:dropout_transition=2,alimiter=limit=0.95:level_in=1:level_out=1[mix]"
  ].join(";");

  const outputPath = path.join(publicDir, "welcome_hud_audio.wav");
  const args = [
    "-y",
    ...sources.flatMap((source) => ["-i", source]),
    "-filter_complex", filterComplex,
    "-map", "[mix]",
    "-ar", "48000",
    "-ac", "2",
    "-t", "10",
    outputPath,
  ];

  await runFfmpeg(args);

  return { outputPath };
};
