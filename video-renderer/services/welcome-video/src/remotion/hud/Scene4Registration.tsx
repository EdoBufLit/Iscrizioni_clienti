import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";

export const Scene4Registration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 80 } });
  const opacity = interpolate(frame, [0, 5], [0, 1], { extrapolateRight: "clamp" });

  const textOpacity = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          transform: `scale(${interpolate(scale, [0, 1], [0.8, 1])})`,
          opacity,
          padding: "40px 80px",
          border: "4px solid #6FF9FF",
          backgroundColor: "rgba(111, 249, 255, 0.1)",
          boxShadow: "0 0 50px rgba(111, 249, 255, 0.6), inset 0 0 30px rgba(111, 249, 255, 0.3)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Flash effect inside box */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#fff",
            opacity: interpolate(frame, [5, 10], [0.8, 0], { extrapolateRight: "clamp" }),
            mixBlendMode: "screen",
          }}
        />

        <h1
          style={{
            fontSize: 72,
            letterSpacing: 10,
            color: "#FFFFFF",
            margin: 0,
            textShadow: "0 0 20px #6FF9FF",
            fontWeight: 700,
            opacity: textOpacity,
          }}
        >
          <TypewriterText text="REGISTRATION" startFrame={5} charsPerFrame={2} />
          <br />
          <span style={{ color: "#6FF9FF" }}>
            <TypewriterText text="COMPLETE" startFrame={15} charsPerFrame={2} />
          </span>
        </h1>
      </div>
    </AbsoluteFill>
  );
};
