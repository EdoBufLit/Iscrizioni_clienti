import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import minimist from "minimist";

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

import { hudSelectSfx } from "./audio/hud/hudSelectSfx";
import { hudGenerateVoices } from "./audio/hud/hudGenerateVoices";
import { hudMixAudio } from "./audio/hud/hudMixAudio";
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

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const normalizeMode = (value: unknown): "review" | "payment_pending" | "approved" => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "payment_pending") return "payment_pending";
  return "review";
};

const normalizeTemplate = (value: unknown): "personalized" | "base" => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "base") return "base";
  return "personalized";
};

const encodeFinalVideo = async (options: {
  inputPath: string;
  outputPath: string;
  useNvenc: boolean;
}): Promise<void> => {
  const env = getEnv();
  const args = [
    "-y",
    "-i",
    options.inputPath,
    "-vf",
    "scale=1280:720:flags=lanczos,fps=24",
  ];

  if (options.useNvenc) {
    args.push("-c:v", "h264_nvenc", "-preset", "p5", "-cq", "23");
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23");
  }

  args.push(
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "copy",
    options.outputPath,
  );

  await runProcess(env.ffmpegBinary, args);
};

const normalizeAudioSource = (value: unknown): "local" | "elevenlabs" => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "elevenlabs") {
    return "elevenlabs";
  }
  return "local";
};

const resolveAudioSource = (
  argv: Record<string, unknown>,
  fallback: "local" | "elevenlabs",
): "local" | "elevenlabs" => {
  const argValue = argv.audioSource ?? argv["audio-source"];
  if (argValue === undefined || argValue === null || String(argValue).trim() === "") {
    return fallback;
  }
  return normalizeAudioSource(argValue);
};

const resolveAudioLocalPath = (argv: Record<string, unknown>, fallback: string): string => {
  const argValue = argv.audioLocalPath ?? argv["audio-local-path"];
  const normalized = String(argValue ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  return path.resolve(normalized);
};

const resolveLocalAudioCandidate = async (audioLocalPath: string): Promise<string | null> => {
  const resolved = path.resolve(audioLocalPath);

  if (await fileExists(resolved)) {
    const stats = await fs.stat(resolved);
    if (stats.isFile()) {
      return resolved;
    }
  }

  const fileCandidates = [
    "welcome_hud_audio.wav",
    "welcome_hud_audio.mp3",
    "welcome_audio.wav",
    "welcome_audio.mp3",
  ];

  for (const fileName of fileCandidates) {
    const candidatePath = path.join(resolved, fileName);
    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
};

const stageLocalAudioTrack = async (sourcePath: string, destinationPath: string): Promise<void> => {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  const extension = path.extname(source).toLowerCase();
  await fs.mkdir(path.dirname(destination), { recursive: true });

  if (extension === ".wav") {
    if (source !== destination) {
      await fs.copyFile(source, destination);
    }
    return;
  }

  const env = getEnv();
  await runProcess(env.ffmpegBinary, [
    "-y",
    "-i",
    source,
    "-ar",
    "48000",
    "-ac",
    "2",
    destination,
  ]);
};

const createSilentAudioTrack = async (
  outputPath: string,
  durationSeconds: number,
): Promise<void> => {
  const env = getEnv();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess(env.ffmpegBinary, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    `${durationSeconds}`,
    "-ar",
    "48000",
    "-ac",
    "2",
    outputPath,
  ]);
};

const main = async (): Promise<void> => {
  const argv = minimist(process.argv.slice(2));
  const env = getEnv();
  
  const orgId = argv.orgId?.toString();
  if (!orgId) {
    throw new Error("Missing --orgId");
  }

  const orgName = argv.orgName?.toString() || "";
  const logoUrl = argv.logoUrl?.toString() || "";
  const mode = normalizeMode(argv.mode);
  const template = normalizeTemplate(argv.template);
  const seed = argv.seed?.toString() || orgId;
  const outputArg = (argv.output ?? argv.out ?? "").toString().trim();
  const skipAudioGeneration =
    argv["skip-audio-generation"] === true || argv.skipAudioGeneration === true;
  const forceAudioGeneration =
    argv["force-audio-generation"] === true || argv.forceAudioGeneration === true;
  const audioSource = resolveAudioSource(argv, env.audioSource);
  const audioLocalPath = resolveAudioLocalPath(argv, env.audioLocalPath);

  const outputPath = outputArg
    ? path.resolve(outputArg)
    : path.resolve(process.cwd(), "out", `welcome_hud_${orgId}.mp4`);
  
  // Create tmp working dir
  const tmpDir = path.resolve(process.cwd(), ".tmp", orgId);
  await fs.mkdir(tmpDir, { recursive: true });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const sharedAudioPath = path.resolve(process.cwd(), "public", "welcome_hud_audio.wav");
  let audioStrategy = "shared";

  if (audioSource === "elevenlabs") {
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

    const hasSharedAudio = await fileExists(sharedAudioPath);
    const shouldGenerateAudio =
      !skipAudioGeneration && (forceAudioGeneration || !hasSharedAudio);

    if (shouldGenerateAudio) {
      const sfx = await hudSelectSfx(path.resolve(process.cwd(), "assets"), seed);
      const generatedVoices = await hudGenerateVoices(orgId);

      await hudMixAudio({
        welcomeFile: generatedVoices.welcomeFile,
        sfx,
        orgId,
      });
      audioStrategy = "elevenlabs";
    } else if (!hasSharedAudio) {
      throw new Error(
        "Audio HUD mancante: genera almeno una volta welcome_hud_audio.wav o abilita la generazione audio.",
      );
    }
  } else {
    const localAudioCandidate = await resolveLocalAudioCandidate(audioLocalPath);
    const hasSharedAudio = await fileExists(sharedAudioPath);

    if (localAudioCandidate) {
      try {
        await stageLocalAudioTrack(localAudioCandidate, sharedAudioPath);
        audioStrategy = "local";
      } catch (error) {
        console.warn(
          `Local audio staging failed (${localAudioCandidate}). Falling back to silent track: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await createSilentAudioTrack(sharedAudioPath, 12);
        audioStrategy = "silent-fallback";
      }
    } else if (!hasSharedAudio) {
      await createSilentAudioTrack(sharedAudioPath, 12);
      audioStrategy = "silent-fallback";
    } else {
      audioStrategy = "shared";
    }
  }

  // Render Video
  const entryPoint = path.resolve(__dirname, "../src/remotion/Root.tsx");
  const entryPointExists = existsSync(entryPoint);
  console.info(
    `[renderHud] remotion entryPoint=${entryPoint} exists=${entryPointExists}`,
  );
  if (!entryPointExists) {
    throw new Error(`Missing Remotion entryPoint: ${entryPoint}`);
  }
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  const inputProps = { orgName, logoUrl, mode, template };
  const compositions = await getCompositions(serveUrl, { inputProps });

  const compositionId = template === "base" ? "AssonamHUDWelcomeBase" : "AssonamHUDWelcome";
  const composition = compositions.find((item) => item.id === compositionId);
  if (!composition) {
    throw new Error(`Composition ${compositionId} not found.`);
  }

  const intermediateOutputPath = path.resolve(
    tmpDir,
    `welcome_hud_${orgId}_intermediate.mp4`,
  );

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: intermediateOutputPath,
    inputProps,
    overwrite: true,
    crf: 23,
    x264Preset: "veryfast",
    imageFormat: "jpeg",
  });

  const hasNvenc = await hasNvencEncoder();
  let usedNvenc = false;
  if (hasNvenc) {
    try {
      await encodeFinalVideo({
        inputPath: intermediateOutputPath,
        outputPath,
        useNvenc: true,
      });
      usedNvenc = true;
    } catch {
      console.warn("NVENC failed at runtime, falling back to libx264.");
      await encodeFinalVideo({
        inputPath: intermediateOutputPath,
        outputPath,
        useNvenc: false,
      });
    }
  } else {
    await encodeFinalVideo({
      inputPath: intermediateOutputPath,
      outputPath,
      useNvenc: false,
    });
  }
  await fs.unlink(intermediateOutputPath).catch(() => {});

  process.stdout.write(
    JSON.stringify({
      status: "done",
      path: outputPath,
      mode,
      template,
      audioSource,
      audioStrategy,
      durationSec: 12,
      outputSpec: {
        width: 1280,
        height: 720,
        fps: 24,
        codec: usedNvenc ? "h264_nvenc" : "h264",
        crf: 23,
        preset: usedNvenc ? "p5" : "veryfast",
      },
    }) + "\n"
  );
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
