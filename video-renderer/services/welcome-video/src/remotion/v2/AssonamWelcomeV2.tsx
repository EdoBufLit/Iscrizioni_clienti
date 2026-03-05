import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import React from "react";
import { BackgroundV2 } from "./BackgroundV2";
import { KineticWords } from "./KineticWords";
import { LogoHero } from "./LogoHero";
import { ExposureFlash } from "./ExposureFlash";
import { CameraPunchV2 } from "./CameraPunchV2";

export const AssonamWelcomeV2: React.FC<{
  orgName?: string;
  logoUrl?: string;
  audioPath?: string;
}> = ({ orgName = "", logoUrl = "", audioPath = "welcome_audio.wav" }) => {
  const frame = useCurrentFrame();

  const words = [
    { text: "ASSONAM è", start: 18, end: 66 },
    { text: "comunità", start: 66, end: 87 },
    { text: "digitale", start: 87, end: 108 },
    { text: "futuro", start: 108, end: 129 },
    { text: "semplice", start: 129, end: 150 },
  ];

  const boomFrame = 156;

  // Global Fade in/out
  const globalOpacity = interpolate(
    frame,
    [0, 18, 318, 330],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Audio src={staticFile(audioPath)} />
      
      <AbsoluteFill style={{ opacity: globalOpacity }}>
        <BackgroundV2 />
        
        <CameraPunchV2 startFrame={boomFrame}>
          <Sequence from={0} durationInFrames={165}>
            <KineticWords words={words} />
          </Sequence>

          {/* Boom moment */}
          <ExposureFlash startFrame={boomFrame} />
          
          <Sequence from={180}>
            <LogoHero
              startFrame={180}
              logoUrl={logoUrl}
              subtitle="Benvenuto in ASSONAM"
              orgName={orgName}
            />
          </Sequence>
        </CameraPunchV2>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};