import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";
import { HUD_BASE_HEIGHT, HUD_BASE_WIDTH, toHudTimelineFrame } from "./hudRuntime";

export const Scene3Connection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timelineFrame = toHudTimelineFrame(frame, fps);

  const centerX = HUD_BASE_WIDTH / 2;
  const centerY = HUD_BASE_HEIGHT / 2;

  const lines = [
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.9, endY: HUD_BASE_HEIGHT * 0.2, delay: 0 },
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.1, endY: HUD_BASE_HEIGHT * 0.8, delay: 5 },
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.2, endY: HUD_BASE_HEIGHT * 0.2, delay: 10 },
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.8, endY: HUD_BASE_HEIGHT * 0.8, delay: 15 },
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.9, endY: HUD_BASE_HEIGHT * 0.6, delay: 8 },
    { startX: centerX, startY: centerY, endX: HUD_BASE_WIDTH * 0.1, endY: HUD_BASE_HEIGHT * 0.4, delay: 12 },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Node lines */}
      {lines.map((line, i) => {
        const lineFrame = Math.max(0, timelineFrame - line.delay);
        const progress = interpolate(lineFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

        const length = Math.sqrt(Math.pow(line.endX - line.startX, 2) + Math.pow(line.endY - line.startY, 2));
        const angle = Math.atan2(line.endY - line.startY, line.endX - line.startX);

        // Moving light dot on line
        const dotProgress = interpolate(lineFrame, [10, 40], [0, 1], { extrapolateRight: "clamp" });
        const dotOpacity = interpolate(lineFrame, [10, 20, 35, 40], [0, 1, 1, 0], { extrapolateRight: "clamp" });
        const dotX = interpolate(dotProgress, [0, 1], [line.startX, line.endX]);
        const dotY = interpolate(dotProgress, [0, 1], [line.startY, line.endY]);

        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                top: line.startY,
                left: line.startX,
                width: length * progress,
                height: 2,
                backgroundColor: "rgba(0, 175, 255, 0.5)",
                transformOrigin: "left center",
                transform: `rotate(${angle}rad)`,
                boxShadow: "0 0 8px rgba(0, 175, 255, 0.35)",
              }}
            />
            {/* Moving light dot */}
            {dotProgress > 0 && dotProgress < 1 && (
              <div
                style={{
                  position: "absolute",
                  top: dotY - 3,
                  left: dotX - 3,
                  width: 6,
                  height: 6,
                  backgroundColor: "#FFF",
                  borderRadius: "50%",
                  opacity: dotOpacity,
                  boxShadow: "0 0 8px 2px rgba(255, 255, 255, 0.55)",
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Nodes (circles) */}
      {lines.map((line, i) => {
        const nodeOpacity = interpolate(timelineFrame, [line.delay + 10, line.delay + 20], [0, 1], { extrapolateRight: "clamp" });
        const nodePulse = 1 + Math.sin((timelineFrame - line.delay) / 4) * 0.15;
        
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
              transform: `scale(${nodePulse})`,
              boxShadow: "0 0 10px 2px rgba(111, 249, 255, 0.45)",
            }}
          />
        );
      })}

      {/* Central connection text */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          backgroundColor: "rgba(2, 4, 10, 0.85)",
          padding: "20px 40px",
          border: "2px solid rgba(0, 175, 255, 0.8)",
          boxShadow: "0 0 18px rgba(0, 175, 255, 0.28)",
          opacity: interpolate(timelineFrame, [15, 25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <h2
          style={{
            color: "#6FF9FF",
            fontSize: 32,
            letterSpacing: 4,
            margin: 0,
            textShadow: "0 0 15px #6FF9FF",
            fontWeight: 500,
          }}
        >
          <TypewriterText text="CONNECTING TO NETWORK..." startFrame={15} charsPerFrame={1} />
        </h2>
      </div>
    </AbsoluteFill>
  );
};
