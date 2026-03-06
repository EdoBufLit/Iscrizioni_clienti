import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import minimist from "minimist";

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

import { hudSelectSfx } from "./audio/hud/hudSelectSfx";
import { hudGenerateVoices } from "./audio/hud/hudGenerateVoices";
import { hudMixAudio } from "./audio/hud/hudMixAudio";
import { getEnv } from "./env";

const CACHE_ROOT = path.resolve(process.cwd(), ".cache", "render-hud");
const BUNDLE_CACHE_ROOT = path.join(CACHE_ROOT, "bundles");
const NVENC_CACHE_PATH = path.join(CACHE_ROOT, "nvenc-capabilities.json");
const INTERMEDIATE_X264_PRESET = "ultrafast";
const FINAL_X264_PRESET = "superfast";
const FINAL_NVENC_PRESET = "p4";

type RenderTimings = Record<string, number>;

type NvencProbeCache = {
  ffmpegSignature: string;
  hasNvenc: boolean;
  checkedAt: string;
};

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

const logStageStart = (stage: string, extra?: string): number => {
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[renderHud] ${stage} start${suffix}`);
  return Date.now();
};

const logStageEnd = (
  stage: string,
  startedAt: number,
  timings: RenderTimings,
  extra?: string,
): number => {
  const duration = Date.now() - startedAt;
  timings[stage] = duration;
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[renderHud] ${stage} end durationMs=${duration}${suffix}`);
  return duration;
};

const measureStage = async <T>(
  timings: RenderTimings,
  stage: string,
  run: () => Promise<T>,
  options?: {
    startExtra?: string;
    endExtra?: (result: T) => string | undefined;
  },
): Promise<T> => {
  const startedAt = logStageStart(stage, options?.startExtra);
  try {
    const result = await run();
    logStageEnd(stage, startedAt, timings, options?.endExtra?.(result));
    return result;
  } catch (error) {
    logStageEnd(
      stage,
      startedAt,
      timings,
      `status=error message=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
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

const safeStat = async (filePath: string): Promise<Stats | null> => {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
};

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const collectFilesRecursively = async (targetPath: string): Promise<string[]> => {
  const stats = await safeStat(targetPath);
  if (!stats) {
    return [];
  }

  if (stats.isFile()) {
    return [targetPath];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => collectFilesRecursively(path.join(targetPath, entry.name))),
  );
  return nested.flat();
};

const buildBundleFingerprint = async (entryPoint: string): Promise<string> => {
  const targets = [
    entryPoint,
    path.resolve(process.cwd(), "src", "audio"),
    path.resolve(process.cwd(), "src", "env.ts"),
    path.resolve(process.cwd(), "src", "renderHud.ts"),
    path.resolve(process.cwd(), "src", "remotion"),
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "package.json"),
    path.resolve(process.cwd(), "package-lock.json"),
  ];

  const hash = crypto.createHash("sha1");
  for (const target of targets) {
    const files = await collectFilesRecursively(target);
    if (files.length === 0) {
      hash.update(`missing:${path.relative(process.cwd(), target)}\n`);
      continue;
    }

    for (const filePath of files.sort()) {
      const stats = await safeStat(filePath);
      if (!stats || !stats.isFile()) {
        continue;
      }
      hash.update(
        `${path.relative(process.cwd(), filePath)}:${stats.size}:${Math.floor(stats.mtimeMs)}\n`,
      );
    }
  }

  return hash.digest("hex");
};

const resolveServeUrl = async (
  entryPoint: string,
  timings: RenderTimings,
): Promise<{ serveUrl: string; bundleCacheHit: boolean }> => {
  const fingerprint = await buildBundleFingerprint(entryPoint);
  const bundleCacheDir = path.join(BUNDLE_CACHE_ROOT, fingerprint);
  const startedAt = logStageStart("bundle", `fingerprint=${fingerprint}`);
  const bundleIndexPath = path.join(bundleCacheDir, "index.html");
  const cacheReusable = await fileExists(bundleIndexPath);

  if (cacheReusable) {
    logStageEnd("bundle", startedAt, timings, "cache=hit");
    return { serveUrl: bundleCacheDir, bundleCacheHit: true };
  }

  await fs.mkdir(BUNDLE_CACHE_ROOT, { recursive: true });

  try {
    const serveUrl = await bundle({
      entryPoint,
      webpackOverride: (config) => config,
      outDir: bundleCacheDir,
      enableCaching: true,
    });
    logStageEnd("bundle", startedAt, timings, "cache=miss");
    return { serveUrl, bundleCacheHit: false };
  } catch (error) {
    await fs.rm(bundleCacheDir, { recursive: true, force: true }).catch(() => undefined);
    logStageEnd(
      "bundle",
      startedAt,
      timings,
      `cache=miss status=error message=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
};

const getNvencSignature = async (ffmpegBinary: string): Promise<string> => {
  const binaryLabel = path.isAbsolute(ffmpegBinary) ? ffmpegBinary : ffmpegBinary.trim();
  const stats = path.isAbsolute(ffmpegBinary) ? await safeStat(ffmpegBinary) : null;
  return `${binaryLabel}:${stats?.size ?? "na"}:${Math.floor(stats?.mtimeMs ?? 0)}`;
};

const hasNvencEncoder = async (timings: RenderTimings): Promise<boolean> => {
  const env = getEnv();
  const ffmpegSignature = await getNvencSignature(env.ffmpegBinary);
  const cached = await readJsonFile<NvencProbeCache>(NVENC_CACHE_PATH);

  if (cached?.ffmpegSignature === ffmpegSignature) {
    timings.nvencProbe = 0;
    console.info(`[renderHud] nvencProbe start cache=hit ffmpeg=${env.ffmpegBinary}`);
    console.info(`[renderHud] nvencProbe end durationMs=0 cache=hit hasNvenc=${cached.hasNvenc}`);
    return cached.hasNvenc;
  }

  const hasNvenc = await measureStage(
    timings,
    "nvencProbe",
    async () => {
      try {
        const output = await runProcess(env.ffmpegBinary, ["-encoders"]);
        return /h264_nvenc/.test(`${output.stdout}\n${output.stderr}`);
      } catch {
        return false;
      }
    },
    {
      startExtra: `cache=miss ffmpeg=${env.ffmpegBinary}`,
      endExtra: (value) => `cache=miss hasNvenc=${value}`,
    },
  );

  await writeJsonFile(NVENC_CACHE_PATH, {
    ffmpegSignature,
    hasNvenc,
    checkedAt: new Date().toISOString(),
  } satisfies NvencProbeCache);

  return hasNvenc;
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
    args.push("-c:v", "h264_nvenc", "-preset", FINAL_NVENC_PRESET, "-cq", "23");
  } else {
    args.push("-c:v", "libx264", "-preset", FINAL_X264_PRESET, "-crf", "23");
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

const resolveRenderConcurrency = (
  argv: Record<string, unknown>,
): number | string | null => {
  const defaultConcurrency = Math.max(1, Math.min(2, os.cpus().length));
  const argValue = argv.renderConcurrency ?? argv["render-concurrency"];
  const envValue =
    process.env.AFFILIATION_VIDEO_RENDER_CONCURRENCY ??
    process.env.WELCOME_VIDEO_RENDER_CONCURRENCY ??
    null;
  const rawValue = String(argValue ?? envValue ?? "").trim();
  if (!rawValue) {
    return defaultConcurrency;
  }
  if (/^\d+%$/.test(rawValue)) {
    return rawValue;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return null;
  }
  return Math.floor(numericValue);
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

const shouldStageSharedAudio = async (
  sourcePath: string,
  destinationPath: string,
): Promise<boolean> => {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedDestination = path.resolve(destinationPath);
  if (resolvedSource === resolvedDestination) {
    return false;
  }

  const [sourceStats, destinationStats] = await Promise.all([
    safeStat(resolvedSource),
    safeStat(resolvedDestination),
  ]);
  if (!sourceStats || !sourceStats.isFile()) {
    return false;
  }
  if (!destinationStats || !destinationStats.isFile() || destinationStats.size === 0) {
    return true;
  }

  return sourceStats.mtimeMs > destinationStats.mtimeMs;
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

const DEFAULT_PUBLIC_LOGO_ASSET = "logo-transparent.png";
const LEGACY_PUBLIC_LOGO_ASSET = "logo.png";

type LogoResolution = {
  logoUrl: string;
  logoAssetPath: string | null;
  logoStrategy: "inline-passthrough" | "remote-inline" | "static-fallback" | "no-logo";
};

const isDataUrl = (value: string): boolean => /^data:/i.test(value);

const isRemoteHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveLogoAssetPath = async (): Promise<string | null> => {
  const publicDir = path.resolve(process.cwd(), "public");
  const candidates = [DEFAULT_PUBLIC_LOGO_ASSET, LEGACY_PUBLIC_LOGO_ASSET];

  for (const assetPath of candidates) {
    if (await fileExists(path.join(publicDir, assetPath))) {
      return assetPath;
    }
  }

  return null;
};

const inferImageContentType = (logoUrl: string): string => {
  const extension = path.extname(new URL(logoUrl).pathname).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  return "image/png";
};

const fetchLogoAsDataUrl = async (logoUrl: string): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(logoUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/*",
        "User-Agent": "assonam-welcome-video-renderer/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Empty response body");
    }

    const contentTypeHeader = response.headers.get("content-type")?.split(";")[0]?.trim();
    const contentType =
      contentTypeHeader && /^image\//i.test(contentTypeHeader)
        ? contentTypeHeader
        : inferImageContentType(logoUrl);

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveLogoInput = async (rawLogoUrl: string): Promise<LogoResolution> => {
  const normalized = rawLogoUrl.trim();
  const logoAssetPath = await resolveLogoAssetPath();

  if (!normalized) {
    return {
      logoUrl: "",
      logoAssetPath,
      logoStrategy: logoAssetPath ? "static-fallback" : "no-logo",
    };
  }

  if (isDataUrl(normalized) || !isRemoteHttpUrl(normalized)) {
    return {
      logoUrl: normalized,
      logoAssetPath,
      logoStrategy: "inline-passthrough",
    };
  }

  try {
    return {
      logoUrl: await fetchLogoAsDataUrl(normalized),
      logoAssetPath,
      logoStrategy: "remote-inline",
    };
  } catch (error) {
    console.warn(
      `[renderHud] Remote logo fetch failed (${normalized}). Falling back to local public asset: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      logoUrl: "",
      logoAssetPath,
      logoStrategy: logoAssetPath ? "static-fallback" : "no-logo",
    };
  }
};

const main = async (): Promise<void> => {
  const totalStartedAt = Date.now();
  const timings: RenderTimings = {};
  const argv = minimist(process.argv.slice(2));
  const env = getEnv();

  const orgId = argv.orgId?.toString();
  if (!orgId) {
    throw new Error("Missing --orgId");
  }

  const orgName = argv.orgName?.toString() || "";
  const requestedLogoUrl = argv.logoUrl?.toString() || "";
  const mode = normalizeMode(argv.mode);
  const template = normalizeTemplate(argv.template);
  const seed = argv.seed?.toString() || orgId;
  const outputArg = (argv.output ?? argv.out ?? "").toString().trim();
  const skipAudioGeneration =
    argv["skip-audio-generation"] === true || argv.skipAudioGeneration === true;
  const forceAudioGeneration =
    argv["force-audio-generation"] === true || argv.forceAudioGeneration === true;
  const audioSource = resolveAudioSource(argv, env.audioSource);
  const renderConcurrency = resolveRenderConcurrency(argv);
  const audioLocalPath = resolveAudioLocalPath(argv, env.audioLocalPath);

  const outputPath = outputArg
    ? path.resolve(outputArg)
    : path.resolve(process.cwd(), "out", `welcome_hud_${orgId}.mp4`);

  const tmpDir = path.resolve(process.cwd(), ".tmp", orgId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const resolvedLogo = await resolveLogoInput(requestedLogoUrl);

  const sharedAudioPath = path.resolve(process.cwd(), "public", "welcome_hud_audio.wav");
  let audioStrategy = "shared";

  await measureStage(timings, "audioPrepare", async () => {
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
      return;
    }

    const localAudioCandidate = await resolveLocalAudioCandidate(audioLocalPath);
    const hasSharedAudio = await fileExists(sharedAudioPath);

    if (localAudioCandidate) {
      try {
        if (await shouldStageSharedAudio(localAudioCandidate, sharedAudioPath)) {
          await stageLocalAudioTrack(localAudioCandidate, sharedAudioPath);
          audioStrategy = "local";
        } else {
          audioStrategy = "local-cached";
        }
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
  });

  const sharedAudioAvailable = await fileExists(sharedAudioPath);
  if (!sharedAudioAvailable) {
    console.warn(
      `[renderHud] ${path.basename(sharedAudioPath)} missing. Rendering without audio track.`,
    );
    audioStrategy = "no-audio";
  }

  const entryPoint = path.resolve(__dirname, "../src/remotion/Root.tsx");
  const entryPointExists = existsSync(entryPoint);
  console.info(`[renderHud] remotion entryPoint=${entryPoint} exists=${entryPointExists}`);
  if (!entryPointExists) {
    throw new Error(`Missing Remotion entryPoint: ${entryPoint}`);
  }

  const { serveUrl, bundleCacheHit } = await resolveServeUrl(entryPoint, timings);

  const inputProps = {
    orgName,
    logoUrl: resolvedLogo.logoUrl,
    logoAssetPath: resolvedLogo.logoAssetPath ?? undefined,
    mode,
    template,
    audioEnabled: sharedAudioAvailable,
  };

  const compositions = await measureStage(
    timings,
    "composition",
    () => getCompositions(serveUrl, { inputProps }),
    {
      endExtra: (items) => `count=${items.length} cacheHit=${bundleCacheHit}`,
    },
  );

  const compositionId = template === "base" ? "AssonamHUDWelcomeBase" : "AssonamHUDWelcome";
  const composition = compositions.find((item) => item.id === compositionId);
  if (!composition) {
    throw new Error(`Composition ${compositionId} not found.`);
  }

  const intermediateOutputPath = path.resolve(
    tmpDir,
    `welcome_hud_${orgId}_intermediate.mp4`,
  );

  let resolvedConcurrency: number | null = null;
  let parallelEncoding = false;
  let slowestFrames: Array<{ frame: number; time: number }> = [];
  const renderResult = await measureStage(timings, "render", () =>
    renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: intermediateOutputPath,
      inputProps,
      overwrite: true,
      crf: 23,
      x264Preset: INTERMEDIATE_X264_PRESET,
      imageFormat: "jpeg",
      pixelFormat: "yuv420p",
      concurrency: renderConcurrency,
      onStart: (data) => {
        resolvedConcurrency = data.resolvedConcurrency;
        parallelEncoding = data.parallelEncoding;
        console.info(
          `[renderHud] render config frameCount=${data.frameCount} resolvedConcurrency=${data.resolvedConcurrency} parallelEncoding=${data.parallelEncoding}`,
        );
      },
    }),
  );
  slowestFrames = renderResult.slowestFrames.slice(0, 5);

  const hasNvenc = await hasNvencEncoder(timings);
  let usedNvenc = false;
  await measureStage(timings, "encode", async () => {
    if (hasNvenc) {
      try {
        await encodeFinalVideo({
          inputPath: intermediateOutputPath,
          outputPath,
          useNvenc: true,
        });
        usedNvenc = true;
        return;
      } catch {
        console.warn("NVENC failed at runtime, falling back to libx264.");
      }
    }

    await encodeFinalVideo({
      inputPath: intermediateOutputPath,
      outputPath,
      useNvenc: false,
    });
  });

  await measureStage(timings, "finalize", async () => {
    await fs.unlink(intermediateOutputPath).catch(() => undefined);
    const finalStats = await safeStat(outputPath);
    if (!finalStats || finalStats.size === 0) {
      throw new Error(`Final video was not written correctly: ${outputPath}`);
    }
  });

  timings.total = Date.now() - totalStartedAt;
  console.info(
    `[renderHud] total end durationMs=${timings.total} bundleCacheHit=${bundleCacheHit} usedNvenc=${usedNvenc}`,
  );

  process.stdout.write(
    JSON.stringify({
      status: "done",
      path: outputPath,
      mode,
      template,
      audioSource,
      audioStrategy,
      logoStrategy: resolvedLogo.logoStrategy,
      durationSec: 12,
      bundleCacheHit,
      nvencDetected: hasNvenc,
      usedNvenc,
      renderConcurrencyRequested: renderConcurrency,
      renderConcurrencyResolved: resolvedConcurrency,
      parallelEncoding,
      slowestFrames,
      timingsMs: timings,
      outputSpec: {
        width: 1280,
        height: 720,
        fps: 24,
        codec: usedNvenc ? "h264_nvenc" : "h264",
        crf: 23,
        preset: usedNvenc ? FINAL_NVENC_PRESET : FINAL_X264_PRESET,
      },
    }) + "\n",
  );
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
