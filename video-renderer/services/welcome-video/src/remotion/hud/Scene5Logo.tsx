import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { TypewriterText } from "../TypewriterText";
import { toHudTimelineFrame } from "./hudRuntime";

export type Scene5Mode = "review" | "payment_pending" | "approved";
export type Scene5Template = "personalized" | "base";

const resolveFinalState = (
  mode: Scene5Mode,
  template: Scene5Template,
): { text: string; color: string; glow: string; border: string; background: string } => {
  if (template === "base") {
    return {
      text: "REGISTRATION RECEIVED\nASSOCIATION CONNECTING TO NETWORK",
      color: "#6FF9FF",
      glow: "0 0 20px rgba(111, 249, 255, 0.9)",
      border: "1px solid rgba(111, 249, 255, 0.8)",
      background: "rgba(111, 249, 255, 0.14)",
    };
  }
  if (mode === "approved") {
    return {
      text: "AFFILIAZIONE APPROVATA",
      color: "#00FF88",
      glow: "0 0 20px rgba(0, 255, 136, 0.9)",
      border: "1px solid rgba(0, 255, 136, 0.8)",
      background: "rgba(0, 255, 136, 0.15)",
    };
  }
  if (mode === "payment_pending") {
    return {
      text: "PAGAMENTO IN VERIFICA",
      color: "#FFCC00",
      glow: "0 0 20px rgba(255, 204, 0, 0.9)",
      border: "1px solid rgba(255, 204, 0, 0.8)",
      background: "rgba(255, 204, 0, 0.18)",
    };
  }
  return {
    text: "RICHIESTA IN REVISIONE",
    color: "#3DE8FF",
    glow: "0 0 20px rgba(61, 232, 255, 0.9)",
    border: "1px solid rgba(61, 232, 255, 0.8)",
    background: "rgba(61, 232, 255, 0.12)",
  };
};

export const Scene5Logo: React.FC<{
  orgName: string;
  logoUrl?: string;
  logoAssetPath?: string;
  mode?: Scene5Mode;
  template?: Scene5Template;
}> = ({
  orgName,
  logoUrl,
  logoAssetPath = "logo-transparent.png",
  mode = "review",
  template = "personalized",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timelineFrame = toHudTimelineFrame(frame, fps);
  const finalState = resolveFinalState(mode, template);
  const showAssociationLine = template !== "base";

  const logoOpacity = interpolate(timelineFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  
  // Animate logo scale from 0.92 to 1.0 over 25 frames
  const logoScale = interpolate(timelineFrame, [0, 25], [0.92, 1.0], { extrapolateRight: "clamp" });

  const textOpacity = interpolate(timelineFrame, [30, 45], [0, 1], { extrapolateRight: "clamp" });
  const finalLabelOpacity = interpolate(timelineFrame, [60, 75], [0, 1], { extrapolateRight: "clamp" });

  const flickerPulse = Math.floor(timelineFrame) % 15 < 3 ? 0.72 : 1;
  const imageSource = logoUrl || (logoAssetPath ? staticFile(logoAssetPath) : "");

  // Soft sweep light across the logo
  const sweepProgress = interpolate(timelineFrame, [25, 55], [-1.2, 1.2], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

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
        {/* Softer glow keeps the reveal but cuts some expensive blur cost. */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "400px",
            height: "400px",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(0, 175, 255, 0.42) 0%, transparent 58%)",
            filter: "blur(16px)",
            zIndex: -1,
          }}
        />

        {imageSource ? (
          <div style={{ position: "relative", overflow: "hidden" }}>
            {/* Logo increased by ~35% (350 -> 470) */}
            <Img
              src={imageSource}
              style={{
                width: 470,
                objectFit: "contain",
                filter: "drop-shadow(0 0 10px rgba(0, 175, 255, 0.68))",
              }}
            />
            
            {/* Sweep effect kept simple to avoid per-frame masking on the logo. */}
            <div
              style={{
                position: "absolute",
                top: "10%",
                left: "5%",
                right: "5%",
                bottom: "10%",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "-30%",
                  width: "45%",
                  height: "100%",
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.16) 50%, transparent 100%)",
                  transform: `translateX(${sweepProgress * 100}%) skewX(-18deg)`,
                }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              minWidth: 470,
              padding: "30px 40px",
              border: "1px solid rgba(111, 249, 255, 0.65)",
              color: "#6FF9FF",
              textAlign: "center",
              fontSize: 40,
              letterSpacing: 6,
              textShadow: "0 0 14px rgba(111, 249, 255, 0.7)",
              background: "rgba(8, 24, 36, 0.55)",
              boxShadow: "0 0 16px rgba(61, 232, 255, 0.2)",
            }}
          >
            {orgName || "ASSONAM"}
          </div>
        )}
      </div>

      {showAssociationLine && (
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
      )}

      <div
        style={{
          opacity: finalLabelOpacity * flickerPulse,
          color: finalState.color,
          fontSize: 24,
          letterSpacing: 6,
          textShadow: finalState.glow,
          fontWeight: 500,
          marginTop: 20,
          padding: "10px 20px",
          border: finalState.border,
          backgroundColor: finalState.background,
          boxShadow: `${finalState.glow}, inset 0 0 8px rgba(255, 255, 255, 0.06)`,
          textAlign: "center",
          whiteSpace: "pre-line",
          lineHeight: 1.4,
          zIndex: 1,
        }}
      >
        <TypewriterText text={finalState.text} startFrame={60} charsPerFrame={0.8} />
      </div>
    </AbsoluteFill>
  );
};
