import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { loadFont } from "@remotion/google-fonts/Orbitron";
import { HudBackground } from "./HudBackground";
import { Scene1Boot } from "./Scene1Boot";
import { Scene2Analysis } from "./Scene2Analysis";
import { Scene3Connection } from "./Scene3Connection";
import { Scene4Registration } from "./Scene4Registration";
import { Scene5Logo, type Scene5Mode, type Scene5Template } from "./Scene5Logo";
import {
  HUD_BASE_HEIGHT,
  HUD_BASE_WIDTH,
  HUD_DURATION_SECONDS,
  getHudCanvasScale,
  toHudTimelineFrame,
} from "./hudRuntime";

const { fontFamily } = loadFont();

export const AssonamHUDWelcome: React.FC<{
  orgName?: string;
  logoUrl?: string;
  logoAssetPath?: string;
  mode?: Scene5Mode;
  template?: Scene5Template;
  audioEnabled?: boolean;
}> = ({
  orgName = "TEST ORG",
  logoUrl = "",
  logoAssetPath = "logo-transparent.png",
  mode = "review",
  template = "personalized",
  audioEnabled = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const scene2OrgName = template === "base" ? "ASSOCIATION" : orgName;
  const timelineFrame = toHudTimelineFrame(frame, fps);
  const canvasScale = getHudCanvasScale(width, height);
  const scene1Frames = Math.round(1.5 * fps);
  const scene2Frames = Math.round(2 * fps);
  const scene3Frames = Math.round(2 * fps);
  const scene4Frames = Math.round(1.5 * fps);
  const scene5Start = scene1Frames + scene2Frames + scene3Frames + scene4Frames;

  // Keep a subtle camera drift without forcing a stronger full-frame rescale.
  const globalScale = interpolate(timelineFrame, [0, HUD_DURATION_SECONDS * 30], [1.0, 1.01]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: HUD_BASE_WIDTH,
          height: HUD_BASE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${canvasScale * globalScale})`,
          transformOrigin: "center center",
        }}
      >
        <HudBackground />
        {audioEnabled ? <Audio src={staticFile("welcome_hud_audio.wav")} /> : null}

        <Sequence from={0} durationInFrames={scene1Frames}>
          <Scene1Boot />
        </Sequence>

        <Sequence from={scene1Frames} durationInFrames={scene2Frames}>
          <Scene2Analysis orgName={scene2OrgName} />
        </Sequence>

        <Sequence from={scene1Frames + scene2Frames} durationInFrames={scene3Frames}>
          <Scene3Connection />
        </Sequence>

        <Sequence
          from={scene1Frames + scene2Frames + scene3Frames}
          durationInFrames={scene4Frames}
        >
          <Scene4Registration />
        </Sequence>

        <Sequence from={scene5Start}>
          <Scene5Logo
            orgName={orgName}
            logoUrl={logoUrl}
            logoAssetPath={logoAssetPath}
            mode={mode}
            template={template}
          />
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
