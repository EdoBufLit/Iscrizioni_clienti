import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const BackgroundV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const driftX = Math.sin(frame / (fps * 2)) * 10;
  const driftY = Math.cos(frame / (fps * 2)) * 10;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, rgba(20,20,25,1) 0%, rgba(5,5,5,1) 100%)",
          transform: `translate(${driftX}px, ${driftY}px) scale(1.05)`,
        }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 150px rgba(0,0,0,0.9)",
        }}
      />
    </AbsoluteFill>
  );
};