import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const CameraPunchV2: React.FC<{ children: React.ReactNode, startFrame: number }> = ({ children, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  // Quick zoom in then slowly back to normal
  const scale = interpolate(
    spring({ fps, frame: relFrame, config: { damping: 12, stiffness: 100 } }),
    [0, 1],
    [1, 1.05]
  );
  const backScale = interpolate(relFrame, [10, 60], [1.05, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const finalScale = relFrame < 10 ? scale : backScale;

  // Tiny shake
  const shakeX = relFrame > 0 && relFrame < 10 ? (Math.random() - 0.5) * 10 * (10 - relFrame) / 10 : 0;
  const shakeY = relFrame > 0 && relFrame < 10 ? (Math.random() - 0.5) * 10 * (10 - relFrame) / 10 : 0;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${finalScale}) translate(${shakeX}px, ${shakeY}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};