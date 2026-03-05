import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const HudBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  // Scanning line animation
  const scanLineY = (frame * 8) % height;

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", overflow: "hidden" }}>
      {/* Digital Grid */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `
            linear-gradient(rgba(0, 175, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 175, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          backgroundPosition: "center center",
          opacity: 0.5,
        }}
      />

      {/* Thin glowing lines */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "5%",
          width: "2px",
          height: "80%",
          background: "linear-gradient(to bottom, transparent, #6FF9FF, transparent)",
          opacity: 0.3 + Math.sin(frame / 5) * 0.1,
          boxShadow: "0 0 10px #6FF9FF",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "10%",
          right: "5%",
          width: "2px",
          height: "80%",
          background: "linear-gradient(to bottom, transparent, #6FF9FF, transparent)",
          opacity: 0.3 + Math.cos(frame / 7) * 0.1,
          boxShadow: "0 0 10px #6FF9FF",
        }}
      />

      {/* Decorative corners */}
      <div style={{ position: "absolute", top: 40, left: 40, width: 40, height: 40, borderTop: "2px solid #00AFFF", borderLeft: "2px solid #00AFFF" }} />
      <div style={{ position: "absolute", top: 40, right: 40, width: 40, height: 40, borderTop: "2px solid #00AFFF", borderRight: "2px solid #00AFFF" }} />
      <div style={{ position: "absolute", bottom: 40, left: 40, width: 40, height: 40, borderBottom: "2px solid #00AFFF", borderLeft: "2px solid #00AFFF" }} />
      <div style={{ position: "absolute", bottom: 40, right: 40, width: 40, height: 40, borderBottom: "2px solid #00AFFF", borderRight: "2px solid #00AFFF" }} />

      {/* Scanning Line */}
      <div
        style={{
          position: "absolute",
          top: scanLineY,
          left: 0,
          right: 0,
          height: "4px",
          backgroundColor: "#6FF9FF",
          opacity: 0.2,
          boxShadow: "0 0 20px 5px rgba(111, 249, 255, 0.5)",
        }}
      />
    </AbsoluteFill>
  );
};
