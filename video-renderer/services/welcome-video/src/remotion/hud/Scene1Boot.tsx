import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";
import { HUD_BASE_HEIGHT, toHudTimelineFrame } from "./hudRuntime";

export const Scene1Boot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timelineFrame = toHudTimelineFrame(frame, fps);

  const textOpacity = interpolate(timelineFrame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const flicker = Math.floor(timelineFrame) % 10 < 2 ? 0.3 : 1;
  const cursor = Math.floor(timelineFrame) % 15 < 7 ? "_" : "";
  
  const loadingPercent = Math.floor(interpolate(timelineFrame, [0, 40], [12, 86], { extrapolateRight: "clamp" }));

  // Horizontal scan line going down
  const scanLineY = interpolate(timelineFrame, [0, 45], [-20, HUD_BASE_HEIGHT + 20]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Fast single scan line */}
      <div
        style={{
          position: "absolute",
          top: scanLineY,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: "#6FF9FF",
          boxShadow: "0 0 6px rgba(111, 249, 255, 0.7)",
          opacity: 0.5,
          zIndex: 10,
        }}
      />

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
          <TypewriterText text="ASSO.N.A.M NETWORK" startFrame={0} charsPerFrame={1} />
        </h2>
        <h3 style={{ fontSize: 24, letterSpacing: 4, margin: 0, color: "#00AFFF", fontWeight: 300 }}>
          SYSTEM INITIALIZING... {loadingPercent}%{cursor}
        </h3>
      </div>
    </AbsoluteFill>
  );
};
