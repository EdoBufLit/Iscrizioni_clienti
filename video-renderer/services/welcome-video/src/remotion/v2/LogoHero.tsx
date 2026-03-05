import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const LogoHero: React.FC<{
  logoUrl?: string;
  subtitle: string;
  orgName?: string;
  startFrame: number;
}> = ({ logoUrl, subtitle, orgName, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  // Intro animations
  const logoScale = spring({ fps, frame: relFrame, config: { damping: 14 } });
  const logoOpacity = interpolate(relFrame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const textOpacity = interpolate(relFrame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(relFrame, [20, 40], [20, 0], { extrapolateRight: "clamp" });

  // Sweep effect on logo
  const sweepProgress = interpolate(relFrame, [30, 60], [-1, 2], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <div
        style={{
          position: "relative",
          opacity: logoOpacity,
          transform: `scale(${interpolate(logoScale, [0, 1], [0.8, 1])})`,
          marginBottom: 40,
        }}
      >
        {logoUrl ? (
          <Img src={logoUrl} style={{ width: 300, objectFit: "contain" }} />
        ) : (
          <div style={{ fontSize: 100, fontWeight: "bold", color: "#fff", fontFamily: "Inter, system-ui" }}>
            ASSONAM
          </div>
        )}

        {/* Clipped Sweep */}
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            overflow: "hidden",
            maskImage: `url(${logoUrl})`,
            WebkitMaskImage: logoUrl ? `url(${logoUrl})` : "none",
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-50%", left: "-50%", width: "200%", height: "200%",
              background: "linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
              transform: `translateX(${sweepProgress * 100}%)`,
            }}
          />
        </div>
      </div>

      <h2
        style={{
          fontFamily: "Inter, system-ui",
          fontSize: 48,
          color: "#ffffff",
          opacity: textOpacity * 0.86,
          transform: `translateY(${textY}px)`,
          margin: 0,
          fontWeight: 400,
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}
      >
        {subtitle}
      </h2>

      {orgName && (
        <h3
          style={{
            fontFamily: "Inter, system-ui",
            fontSize: 28,
            color: "#ffffff",
            opacity: textOpacity * 0.75,
            transform: `translateY(${textY}px)`,
            marginTop: 20,
            fontWeight: 300,
            maxWidth: 900,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: 2,
          }}
        >
          ASSOCIAZIONE: {orgName}
        </h3>
      )}
    </AbsoluteFill>
  );
};