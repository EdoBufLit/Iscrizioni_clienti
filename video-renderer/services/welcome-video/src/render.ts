import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import minimist from "minimist";

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

import { selectSfx, SfxSelection } from "./audio/selectSfx";
import { generateVoices } from "./audio/generateVoices";
import { mixAudio } from "./audio/mixAudio";
import { getEnv } from "./env";

const runProcess = async (binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${binary} ${args.join(" ")} failed with code ${code}\n${stderr}`));
    });
  });
};

const hasNvencEncoder = async (): Promise<boolean> => {
  const env = getEnv();
  try {
    const output = await runProcess(env.ffmpegBinary, ["-encoders"]);
    return /h264_nvenc/.test(`${output.stdout}\n${output.stderr}`);
  } catch {
    return false;
  }
};

const main = async (): Promise<void> => {
  const argv = minimist(process.argv.slice(2));
  
  const orgId = argv.orgId?.toString();
  if (!orgId) {
    throw new Error("Missing --orgId");
  }

  const orgName = argv.orgName?.toString() || "";
  const logoUrl = argv.logoUrl?.toString() || "";
  const seed = argv.seed?.toString() || orgId;

  const env = getEnv();
  
  // 2) Create tmp working dir
  const tmpDir = path.resolve(process.cwd(), ".tmp", orgId);
  await fs.mkdir(tmpDir, { recursive: true });

  const outDir = path.resolve(process.cwd(), "out");
  await fs.mkdir(outDir, { recursive: true });

  // 3) Select SFX deterministically
  const sfx = await selectSfx(path.resolve(process.cwd(), "assets"), seed);

  // 4) Generate Voices via ElevenLabs
  const generatedVoices = await generateVoices(orgId);

  // 5) Mix Audio
  await mixAudio({
    voiceFiles: generatedVoices.voiceFiles,
    welcomeFile: generatedVoices.welcomeFile,
    sfx,
    orgId
  });

  // 6) Render Video
  const entryPoint = path.resolve(process.cwd(), "src", "remotion", "Root.tsx");
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  const inputProps = { orgName, logoUrl };
  const compositions = await getCompositions(serveUrl, { inputProps });

  const composition = compositions.find((item) => item.id === "AssonamWelcomeV2");
  if (!composition) {
    throw new Error("Composition AssonamWelcomeV2 not found.");
  }

  const hasNvenc = await hasNvencEncoder();
  const intermediateOutputPath = hasNvenc 
    ? path.join(outDir, `welcome_${orgId}_intermediate.mp4`)
    : path.join(outDir, `welcome_${orgId}.mp4`);
  
  const finalOutputPath = path.join(outDir, `welcome_${orgId}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: intermediateOutputPath,
    inputProps,
    overwrite: true,
    crf: 18,
    x264Preset: "medium",
    imageFormat: "jpeg",
  });

  if (hasNvenc) {
    try {
      await runProcess(env.ffmpegBinary, [
        "-y",
        "-i", intermediateOutputPath,
        "-c:v", "h264_nvenc",
        "-preset", "p5",
        "-cq", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        finalOutputPath
      ]);
      await fs.unlink(intermediateOutputPath).catch(() => {});
    } catch (e) {
      console.warn("NVENC failed at runtime, falling back to libx264 intermediate file.");
      await fs.rename(intermediateOutputPath, finalOutputPath);
    }
  }

  const sfxNames = {
    impact: sfx.impact.name,
    rise: sfx.rise.name,
    whoosh: sfx.whoosh.name,
    sparkle: sfx.sparkle.name,
    ambience: sfx.ambience.name
  };

  process.stdout.write(
    JSON.stringify({
      status: "done",
      path: finalOutputPath,
      sfx: sfxNames,
      durationSec: 11
    }) + "\n"
  );
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});