import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";

export const Scene5Logo: React.FC<{ orgName: string; logoUrl?: string }> = ({ orgName, logoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  
  // Animate logo scale from 0.92 to 1.0 over 25 frames
  const logoScale = interpolate(frame, [0, 25], [0.92, 1.0], { extrapolateRight: "clamp" });

  const textOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp" });
  const adminAccessOpacity = interpolate(frame, [60, 75], [0, 1], { extrapolateRight: "clamp" });

  const flickerAdmin = frame % 15 < 3 ? 0.4 : 1;
  const imageSource = logoUrl || staticFile("logo.png");

  // Soft sweep light across the logo
  const sweepProgress = interpolate(frame, [25, 55], [-1.5, 1.5], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      {/* Background Radial Glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "150%",
          height: "150%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(0,200,255,0.25) 0%, transparent 50%)",
          zIndex: 0,
        }}
      />

      {/* Logo Container */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 15,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Soft Glow Behind Logo */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "400px",
            height: "400px",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(0, 175, 255, 0.5) 0%, transparent 60%)",
            filter: "blur(25px)",
            zIndex: -1,
          }}
        />

        <div style={{ position: "relative", overflow: "hidden" }}>
          {/* Logo increased by ~35% (350 -> 470) */}
          <Img src={imageSource} style={{ width: 470, objectFit: "contain", filter: "drop-shadow(0 0 15px rgba(0, 175, 255, 0.8))" }} />
          
          {/* Sweep effect mask */}
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              maskImage: `url(${imageSource})`,
              WebkitMaskImage: `url(${imageSource})`,
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-50%", left: "-50%", width: "200%", height: "200%",
                background: "linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)",
                transform: `translateX(${sweepProgress * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          opacity: textOpacity,
          color: "#FFFFFF",
          fontSize: 32,
          letterSpacing: 4,
          textShadow: "0 0 15px rgba(0, 175, 255, 0.8)",
          fontWeight: 300,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <TypewriterText text={`ASSOCIATION: ${orgName}`} startFrame={30} charsPerFrame={1} />
      </div>

      <div
        style={{
          opacity: adminAccessOpacity * flickerAdmin,
          color: "#00FF00", 
          fontSize: 24,
          letterSpacing: 6,
          textShadow: "0 0 20px #00FF00", // Increased green glow
          fontWeight: 500,
          marginTop: 20,
          padding: "10px 20px",
          border: "1px solid rgba(0, 255, 0, 0.8)",
          backgroundColor: "rgba(0, 255, 0, 0.15)",
          boxShadow: "0 0 20px rgba(0, 255, 0, 0.3), inset 0 0 10px rgba(0, 255, 0, 0.2)", // Extra box glow
          zIndex: 1,
        }}
      >
        <TypewriterText text="ADMIN ACCESS ENABLED" startFrame={60} charsPerFrame={0.8} />
      </div>
    </AbsoluteFill>
  );
};
