import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";

import { Background } from "./Background";
import { CameraPunch } from "./CameraPunch";
import { ChromaticAberration } from "./ChromaticAberration";
import { GrainOverlay } from "./GrainOverlay";
import { LogoReveal } from "./LogoReveal";
import { ParticlesIntro } from "./ParticlesIntro";
import { DialogBox } from "./DialogBox";
import { tokens } from "./tokens";

type IntroLine = {
  top: number;
  left: number;
  start: number;
  size: number;
};

const IntroTextOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  
  // 6 lines along a diagonal arc
  const lines = useMemo<IntroLine[]>(
    () => [
      { top: 20, left: 20, start: 0, size: 58 },
      { top: 32, left: 30, start: 8, size: 62 },
      { top: 45, left: 40, start: 16, size: 66 },
      { top: 58, left: 50, start: 24, size: 70 },
      { top: 70, left: 60, start: 32, size: 66 },
      { top: 82, left: 70, start: 40, size: 62 },
    ],
    [],
  );

  return (
    <AbsoluteFill>
      {lines.map((line, index) => {
        const opacity = interpolate(frame, [line.start, line.start + 10, line.start + 36], [0, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const blur = interpolate(frame, [line.start, line.start + 10, line.start + 26, line.start + 36], [3, 0, 0, 3], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const driftY = interpolate(frame, [line.start, line.start + 36], [0, 8], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              top: `${line.top}%`,
              left: `${line.left}%`,
              transform: `translate(-50%, calc(-50% + ${driftY}px))`,
              color: tokens.white,
              opacity,
              filter: `blur(${blur}px)`,
              fontWeight: 600,
              fontSize: line.size,
              letterSpacing: 4,
            }}
          >
            ASSONAM è
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const FlashTransition: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 4, 14], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ backgroundColor: "white" }} />
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)",
        }}
      />
    </AbsoluteFill>
  );
};

const FinalMessage: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 26], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: "0.02em",
          color: tokens.white,
          marginBottom: 24,
          textShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        Iscrizione completata
      </div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 600,
          lineHeight: 1.4,
          color: tokens.whiteSoft,
          maxWidth: 980,
        }}
      >
        Puoi fare l&apos;accesso con la tua mail
        <br />
        dall&apos;Area Riservata Admin Associazione
      </div>
    </AbsoluteFill>
  );
};

const FadeOut: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ backgroundColor: tokens.bg, opacity }} />;
};

export const AssonamWelcome: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg, overflow: "hidden" }}>
      <Audio src={staticFile("welcome_audio.wav")} />

      <CameraPunch triggerFrame={126}>
        <ChromaticAberration startFrame={90} endFrame={150} spikeFrames={[124, 130]}>
          <Background>
            <Sequence from={0} durationInFrames={120} premountFor={30}>
              <ParticlesIntro />
            </Sequence>

            <Sequence from={40} durationInFrames={80} premountFor={20}>
              <IntroTextOverlay />
            </Sequence>

            <Sequence from={120} durationInFrames={20}>
              <FlashTransition />
            </Sequence>

            <Sequence from={140} durationInFrames={30}>
              <AbsoluteFill style={{ backgroundColor: tokens.bg }} />
            </Sequence>

            <Sequence from={170} durationInFrames={70} premountFor={15}>
              <DialogBox text="Benvenuto in ASSONAM" />
            </Sequence>

            <Sequence from={240} durationInFrames={90} premountFor={15}>
              <LogoReveal />
            </Sequence>

            <Sequence from={330} durationInFrames={90} premountFor={10}>
              <FinalMessage />
            </Sequence>

            <Sequence from={420} durationInFrames={30}>
              <FadeOut />
            </Sequence>

            <GrainOverlay />
          </Background>
        </ChromaticAberration>
      </CameraPunch>
    </AbsoluteFill>
  );
};
