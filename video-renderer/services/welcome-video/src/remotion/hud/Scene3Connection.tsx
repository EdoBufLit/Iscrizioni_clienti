import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const Scene3Connection: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const lines = [
    { startX: width * 0.1, startY: height * 0.5, endX: width * 0.9, endY: height * 0.5, delay: 0 },
    { startX: width * 0.5, startY: height * 0.1, endX: width * 0.5, endY: height * 0.9, delay: 5 },
    { startX: width * 0.2, startY: height * 0.2, endX: width * 0.8, endY: height * 0.8, delay: 10 },
    { startX: width * 0.8, startY: height * 0.2, endX: width * 0.2, endY: height * 0.8, delay: 15 },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Node lines */}
      {lines.map((line, i) => {
        const lineFrame = Math.max(0, frame - line.delay);
        const progress = interpolate(lineFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
        const curX = interpolate(progress, [0, 1], [line.startX, line.endX]);
        const curY = interpolate(progress, [0, 1], [line.startY, line.endY]);

        const length = Math.sqrt(Math.pow(line.endX - line.startX, 2) + Math.pow(line.endY - line.startY, 2));
        const angle = Math.atan2(line.endY - line.startY, line.endX - line.startX);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: line.startY,
              left: line.startX,
              width: length * progress,
              height: 2,
              backgroundColor: "rgba(0, 175, 255, 0.4)",
              transformOrigin: "left center",
              transform: `rotate(${angle}rad)`,
              boxShadow: "0 0 10px rgba(0, 175, 255, 0.5)",
            }}
          />
        );
      })}

      {/* Nodes (circles) */}
      {lines.map((line, i) => {
        const nodeOpacity = interpolate(frame, [line.delay + 10, line.delay + 20], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div
            key={`node-${i}`}
            style={{
              position: "absolute",
              top: line.endY - 6,
              left: line.endX - 6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: "#6FF9FF",
              opacity: nodeOpacity,
              boxShadow: "0 0 15px 5px rgba(111, 249, 255, 0.6)",
            }}
          />
        );
      })}

      {/* Central connection text */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: "20px 40px",
          border: "1px solid #00AFFF",
          boxShadow: "0 0 30px rgba(0, 175, 255, 0.3)",
          opacity: interpolate(frame, [15, 25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <h2
          style={{
            color: "#6FF9FF",
            fontSize: 32,
            letterSpacing: 4,
            margin: 0,
            textShadow: "0 0 10px #6FF9FF",
            fontWeight: 500,
          }}
        >
          CONNECTING TO NETWORK...
        </h2>
      </div>
    </AbsoluteFill>
  );
};
