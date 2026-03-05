import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";

export const Scene2Analysis: React.FC<{ orgName: string }> = ({ orgName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Panel enter
  const panelScaleIn = spring({ fps, frame: frame, config: { damping: 15 } });
  const panelScaleFinal = interpolate(panelScaleIn, [0, 1], [0.96, 1.0]);

  const textOpacity = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: "clamp" });
  const verifiedOpacity = interpolate(frame, [35, 40], [0, 1], { extrapolateRight: "clamp" });

  const showVerified = frame > 35;
  const verifiedPulse = showVerified ? 1 + Math.sin((frame - 35) / 3) * 0.05 : 1;

  // Scanning light line over the panel
  const scanLineX = interpolate(frame, [0, 60], [-800, 800]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 800,
          padding: 40,
          border: "1px solid rgba(0, 175, 255, 0.6)",
          backgroundColor: "rgba(2, 4, 10, 0.8)",
          boxShadow: "0 0 40px rgba(0, 175, 255, 0.3), inset 0 0 30px rgba(0, 175, 255, 0.2)",
          transform: `scale(${panelScaleFinal})`,
          transformOrigin: "center center",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scanning horizontal light line moving across panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: scanLineX,
            width: 50,
            background: "linear-gradient(to right, transparent, rgba(111, 249, 255, 0.3), transparent)",
            transform: "skewX(-20deg)",
            pointerEvents: "none",
          }}
        />

        {/* Panel corner accents */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 20, height: 2, background: "#6FF9FF" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: 20, background: "#6FF9FF" }} />

        <div style={{ position: "absolute", top: 0, right: 0, width: 20, height: 2, background: "#6FF9FF" }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: 2, height: 20, background: "#6FF9FF" }} />

        <div style={{ position: "absolute", bottom: 0, left: 0, width: 20, height: 2, background: "#6FF9FF" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 2, height: 20, background: "#6FF9FF" }} />

        <div style={{ position: "absolute", bottom: 0, right: 0, width: 20, height: 2, background: "#6FF9FF" }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 2, height: 20, background: "#6FF9FF" }} />

        {/* Content */}
        <h3
          style={{
            fontSize: 24,
            letterSpacing: 4,
            color: "#00AFFF",
            margin: 0,
            opacity: textOpacity,
            fontWeight: 400,
          }}
        >
          <TypewriterText text="ANALYZING TARGET" startFrame={5} charsPerFrame={1} />
        </h3>
        <h2
          style={{
            fontSize: 48,
            letterSpacing: 6,
            color: "#FFFFFF",
            margin: 0,
            opacity: textOpacity,
            fontWeight: 600,
            textShadow: "0 0 10px rgba(255,255,255,0.5)",
          }}
        >
          <TypewriterText text={orgName} startFrame={10} charsPerFrame={1.5} />
        </h2>

        {showVerified && (
          <div
            style={{
              marginTop: 20,
              padding: "10px 20px",
              backgroundColor: "rgba(111, 249, 255, 0.15)",
              border: "1px solid #6FF9FF",
              display: "inline-block",
              alignSelf: "flex-start",
              opacity: verifiedOpacity,
              transform: `scale(${verifiedPulse})`,
              boxShadow: "0 0 20px rgba(111, 249, 255, 0.4)",
            }}
          >
            <h3
              style={{
                fontSize: 28,
                letterSpacing: 4,
                color: "#6FF9FF",
                margin: 0,
                textShadow: "0 0 15px #6FF9FF",
                fontWeight: 500,
              }}
            >
              STATUS: VERIFIED
            </h3>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
