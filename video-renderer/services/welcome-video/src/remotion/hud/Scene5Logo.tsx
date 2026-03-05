import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const Scene5Logo: React.FC<{ orgName: string; logoUrl?: string }> = ({ orgName, logoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const logoScale = spring({ fps, frame, config: { damping: 14 } });

  const textOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp" });
  const adminAccessOpacity = interpolate(frame, [60, 75], [0, 1], { extrapolateRight: "clamp" });

  const flickerAdmin = frame % 15 < 3 ? 0.4 : 1;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      {/* Logo Container */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${interpolate(logoScale, [0, 1], [0.8, 1])})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 15,
          position: "relative",
        }}
      >
        {/* Soft Glow Behind Logo */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "300px",
            height: "300px",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(0, 175, 255, 0.4) 0%, transparent 70%)",
            filter: "blur(20px)",
            zIndex: -1,
          }}
        />

        {logoUrl ? (
          <Img src={logoUrl} style={{ width: 350, objectFit: "contain", filter: "drop-shadow(0 0 10px #00AFFF)" }} />
        ) : (
          <h1 style={{ fontSize: 100, color: "#FFF", textShadow: "0 0 20px #00AFFF", margin: 0, fontWeight: 700 }}>
            ASSONAM
          </h1>
        )}
      </div>

      <div
        style={{
          opacity: textOpacity,
          color: "#FFFFFF",
          fontSize: 32,
          letterSpacing: 4,
          textShadow: "0 0 10px rgba(0, 175, 255, 0.8)",
          fontWeight: 300,
          textAlign: "center",
        }}
      >
        ASSOCIATION: <span style={{ color: "#6FF9FF", fontWeight: 500 }}>{orgName}</span>
      </div>

      <div
        style={{
          opacity: adminAccessOpacity * flickerAdmin,
          color: "#00FF00", // Greenish for admin access success
          fontSize: 24,
          letterSpacing: 6,
          textShadow: "0 0 15px #00FF00",
          fontWeight: 500,
          marginTop: 20,
          padding: "10px 20px",
          border: "1px solid rgba(0, 255, 0, 0.5)",
          backgroundColor: "rgba(0, 255, 0, 0.1)",
        }}
      >
        ADMIN ACCESS ENABLED
      </div>
    </AbsoluteFill>
  );
};
