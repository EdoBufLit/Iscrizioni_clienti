import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const Scene4Registration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fast strong scale in
  const scaleIn = spring({ fps, frame, config: { damping: 14, stiffness: 120 } });
  const scale = interpolate(scaleIn, [0, 1], [0.9, 1.0]);
  
  // Quick fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const flashOpacity = interpolate(frame, [0, 5, 15], [0, 1, 0], { extrapolateRight: "clamp" });
  const horizontalFlashWidth = interpolate(frame, [0, 10], [0, 1920], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      
      {/* Background horizontal flash */}
      <div 
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          height: 120,
          width: horizontalFlashWidth,
          background: "linear-gradient(to right, transparent, rgba(111, 249, 255, 0.4), transparent)",
          opacity: flashOpacity,
          zIndex: 0,
        }}
      />

      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          padding: "40px 80px",
          border: "4px solid #6FF9FF",
          backgroundColor: "rgba(111, 249, 255, 0.15)",
          boxShadow: "0 0 26px rgba(111, 249, 255, 0.42), inset 0 0 18px rgba(111, 249, 255, 0.18)",
          position: "relative",
          overflow: "hidden",
          zIndex: 1,
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
            opacity: flashOpacity * 0.3,
          }}
        />

        <h1
          style={{
            fontSize: 72,
            letterSpacing: 10,
            color: "#FFFFFF",
            margin: 0,
            textShadow: "0 0 30px #6FF9FF",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          REGISTRATION
          <br />
          <span style={{ color: "#6FF9FF" }}>
            COMPLETE
          </span>
        </h1>
      </div>
    </AbsoluteFill>
  );
};
