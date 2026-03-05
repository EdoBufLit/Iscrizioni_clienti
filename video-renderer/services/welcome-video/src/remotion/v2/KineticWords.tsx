import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const KineticWords: React.FC<{ words: { text: string, start: number, end: number }[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {words.map((w, i) => {
        const isActive = frame >= w.start && frame < w.end;
        if (!isActive) return null;

        const relFrame = frame - w.start;
        const duration = w.end - w.start;

        const enter = spring({ fps, frame: relFrame, config: { damping: 12 } });
        const exitProgress = Math.max(0, frame - (w.end - 10)); // start exit 10 frames before end
        const exitOpacity = interpolate(exitProgress, [0, 10], [1, 0], { extrapolateRight: "clamp" });
        const blur = interpolate(exitProgress, [0, 10], [0, 10]);

        return (
          <AbsoluteFill
            key={i}
            style={{
              justifyContent: "center",
              alignItems: "center",
              opacity: exitOpacity,
              transform: `scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
              filter: `blur(${blur}px)`,
            }}
          >
            <h1
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 120,
                color: "#ffffff",
                fontWeight: 600,
                textShadow: "0 4px 20px rgba(0,0,0,0.5)",
                margin: 0,
              }}
            >
              {w.text}
            </h1>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};