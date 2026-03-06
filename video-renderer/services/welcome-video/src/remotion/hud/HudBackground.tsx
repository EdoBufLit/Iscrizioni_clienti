import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";
import { HUD_BASE_HEIGHT, toHudTimelineFrame } from "./hudRuntime";

const NOISE_TEXTURE_BACKGROUND =
  "url('data:image/svg+xml;utf8,%3Csvg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"noiseFilter\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.55\" numOctaves=\"2\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23noiseFilter)\"/%3E%3C/svg%3E')";

export const HudBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timelineFrame = toHudTimelineFrame(frame, fps);

  // Scanning line animation
  const scanLineY = (timelineFrame * 6) % HUD_BASE_HEIGHT;
  const edgeGlowLeftOpacity = 0.28 + Math.sin(timelineFrame / 5) * 0.08;
  const edgeGlowRightOpacity = 0.28 + Math.cos(timelineFrame / 7) * 0.08;
  const latencyMs = Math.round(12 + Math.sin(timelineFrame / 8) * 4);

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", overflow: "hidden" }}>
      {/* Center Radial Glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "120%",
          height: "120%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(0,200,255,0.18) 0%, transparent 60%)",
          zIndex: 0,
        }}
      />

      {/* Animated Noise Texture Overlay */}
      <div
        style={{
          position: "absolute",
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          backgroundImage: NOISE_TEXTURE_BACKGROUND,
          opacity: 0.025,
          zIndex: 1,
        }}
      />

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
          zIndex: 2,
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
          background: "linear-gradient(to bottom, transparent, rgba(0,200,255,0.8), transparent)",
          opacity: edgeGlowLeftOpacity,
          boxShadow: "0 0 6px rgba(0,200,255,0.55)",
          zIndex: 3,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "10%",
          right: "5%",
          width: "2px",
          height: "80%",
          background: "linear-gradient(to bottom, transparent, rgba(0,200,255,0.8), transparent)",
          opacity: edgeGlowRightOpacity,
          boxShadow: "0 0 6px rgba(0,200,255,0.55)",
          zIndex: 3,
        }}
      />

      {/* Faint cyan glow lines crossing screen horizontally */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(to right, transparent, rgba(0,200,255,0.2), transparent)",
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "70%",
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(to right, transparent, rgba(0,200,255,0.2), transparent)",
          zIndex: 2,
        }}
      />

      {/* Decorative corners */}
      <div style={{ position: "absolute", top: 40, left: 40, width: 40, height: 40, borderTop: "2px solid #00AFFF", borderLeft: "2px solid #00AFFF", zIndex: 3 }} />
      <div style={{ position: "absolute", top: 40, right: 40, width: 40, height: 40, borderTop: "2px solid #00AFFF", borderRight: "2px solid #00AFFF", zIndex: 3 }} />
      <div style={{ position: "absolute", bottom: 40, left: 40, width: 40, height: 40, borderBottom: "2px solid #00AFFF", borderLeft: "2px solid #00AFFF", zIndex: 3 }} />
      <div style={{ position: "absolute", bottom: 40, right: 40, width: 40, height: 40, borderBottom: "2px solid #00AFFF", borderRight: "2px solid #00AFFF", zIndex: 3 }} />

      {/* Micro HUD elements around edges */}
      <div style={{ position: "absolute", top: 45, left: 90, color: "#6FF9FF", fontSize: 12, opacity: 0.4, letterSpacing: 2, zIndex: 3 }}>
        SYS NODE 03
      </div>
      <div style={{ position: "absolute", top: 45, right: 90, color: "#6FF9FF", fontSize: 12, opacity: 0.4, letterSpacing: 2, zIndex: 3 }}>
        SECURE CHANNEL
      </div>
      <div style={{ position: "absolute", bottom: 45, left: 90, color: "#6FF9FF", fontSize: 12, opacity: 0.4, letterSpacing: 2, zIndex: 3 }}>
        LATENCY {latencyMs}ms
      </div>
      <div style={{ position: "absolute", bottom: 45, right: 90, color: "#6FF9FF", fontSize: 12, opacity: 0.4, letterSpacing: 2, zIndex: 3 }}>
        FREQ 409.8 MHz
      </div>

      {/* Scanning Line */}
      <div
        style={{
          position: "absolute",
          top: scanLineY,
          left: 0,
          right: 0,
          height: "3px",
          backgroundColor: "#6FF9FF",
          opacity: 0.12,
          boxShadow: "0 0 12px 3px rgba(111, 249, 255, 0.28)",
          zIndex: 4,
        }}
      />
    </AbsoluteFill>
  );
};
