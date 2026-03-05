import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import React from "react";
import { loadFont } from "@remotion/google-fonts/Orbitron";
import { HudBackground } from "./HudBackground";
import { Scene1Boot } from "./Scene1Boot";
import { Scene2Analysis } from "./Scene2Analysis";
import { Scene3Connection } from "./Scene3Connection";
import { Scene4Registration } from "./Scene4Registration";
import { Scene5Logo, type Scene5Mode, type Scene5Template } from "./Scene5Logo";

const { fontFamily } = loadFont();

export const AssonamHUDWelcome: React.FC<{
  orgName?: string;
  logoUrl?: string;
  mode?: Scene5Mode;
  template?: Scene5Template;
  audioEnabled?: boolean;
}> = ({
  orgName = "TEST ORG",
  logoUrl = "",
  mode = "review",
  template = "personalized",
  audioEnabled = true,
}) => {
  const frame = useCurrentFrame();
  const scene2OrgName = template === "base" ? "ASSOCIATION" : orgName;

  // Global slow zoom
  const globalScale = interpolate(frame, [0, 360], [1.0, 1.03]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily, transform: `scale(${globalScale})` }}>
      <HudBackground />
      {audioEnabled ? <Audio src={staticFile("welcome_hud_audio.wav")} /> : null}

      {/* SCENE 1 - SYSTEM BOOT */}
      <Sequence from={0} durationInFrames={45}>
        <Scene1Boot />
      </Sequence>

      {/* SCENE 2 - ASSOCIATION ANALYSIS */}
      <Sequence from={45} durationInFrames={60}>
        <Scene2Analysis orgName={scene2OrgName} />
      </Sequence>

      {/* SCENE 3 - NETWORK CONNECTION */}
      <Sequence from={105} durationInFrames={60}>
        <Scene3Connection />
      </Sequence>

      {/* SCENE 4 - REGISTRATION COMPLETE */}
      <Sequence from={165} durationInFrames={45}>
        <Scene4Registration />
      </Sequence>

      {/* SCENE 5 - LOGO REVEAL & SCENE 6 - FINAL MESSAGE */}
      <Sequence from={210}>
        <Scene5Logo orgName={orgName} logoUrl={logoUrl} mode={mode} template={template} />
      </Sequence>
    </AbsoluteFill>
  );
};
