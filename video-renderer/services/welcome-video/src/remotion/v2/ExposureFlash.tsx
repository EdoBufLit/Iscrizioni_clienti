import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import React from "react";

export const ExposureFlash: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const relFrame = frame - startFrame;

  if (relFrame < 0 || relFrame > 15) return null;

  const opacity = interpolate(relFrame, [0, 2, 15], [0, 1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ffffff",
        opacity,
        mixBlendMode: "screen",
      }}
    />
  );
};