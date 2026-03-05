import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const Scene1Boot: React.FC = () => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const flicker = frame % 10 < 2 ? 0.3 : 1;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          color: "#6FF9FF",
          textAlign: "center",
          textShadow: "0 0 10px rgba(111, 249, 255, 0.8)",
          opacity: textOpacity * flicker,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <h2 style={{ fontSize: 32, letterSpacing: 8, margin: 0, fontWeight: 300 }}>
          ASSO.N.A.M NETWORK
        </h2>
        <h3 style={{ fontSize: 24, letterSpacing: 4, margin: 0, color: "#00AFFF", fontWeight: 300 }}>
          SYSTEM INITIALIZING... {Math.min(100, Math.floor(frame * 1.66))}%
        </h3>
      </div>
    </AbsoluteFill>
  );
};
