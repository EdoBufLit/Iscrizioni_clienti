import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { loadFont } from "@remotion/google-fonts/Orbitron";
import { HudBackground } from "./HudBackground";
import { Scene1Boot } from "./Scene1Boot";
import { Scene2Analysis } from "./Scene2Analysis";
import { Scene3Connection } from "./Scene3Connection";
import { Scene4Registration } from "./Scene4Registration";
import { Scene5Logo } from "./Scene5Logo";

const { fontFamily } = loadFont();

export const AssonamHUDWelcome: React.FC<{
  orgName?: string;
  logoUrl?: string;
  audioPath?: string;
}> = ({ orgName = "TEST ORG", logoUrl = "", audioPath = "welcome_hud_audio.wav" }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <HudBackground />
      <Audio src={staticFile(audioPath)} />

      {/* SCENE 1 - SYSTEM BOOT */}
      <Sequence from={0} durationInFrames={45}>
        <Scene1Boot />
      </Sequence>

      {/* SCENE 2 - ASSOCIATION ANALYSIS */}
      <Sequence from={45} durationInFrames={45}>
        <Scene2Analysis orgName={orgName} />
      </Sequence>

      {/* SCENE 3 - NETWORK CONNECTION */}
      <Sequence from={90} durationInFrames={45}>
        <Scene3Connection />
      </Sequence>

      {/* SCENE 4 - REGISTRATION COMPLETE */}
      <Sequence from={135} durationInFrames={30}>
        <Scene4Registration />
      </Sequence>

      {/* SCENE 5 - LOGO REVEAL & SCENE 6 - FINAL MESSAGE */}
      <Sequence from={165}>
        <Scene5Logo orgName={orgName} logoUrl={logoUrl} />
      </Sequence>
    </AbsoluteFill>
  );
};
