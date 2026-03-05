import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const HudBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();

  // Scanning line animation
  const scanLineY = (frame * 6) % height;
  
  // Noise displacement based on time to animate very subtly
  const noiseOffsetX = (frame % 30) * 2;
  const noiseOffsetY = (frame % 30) * 2;

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
          backgroundImage: `url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E')`,
          opacity: 0.04,
          transform: `translate(${noiseOffsetX}px, ${noiseOffsetY}px)`,
          mixBlendMode: "overlay",
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
          opacity: 0.3 + Math.sin(frame / 5) * 0.1,
          boxShadow: "0 0 10px rgba(0,200,255,0.8)",
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
          opacity: 0.3 + Math.cos(frame / 7) * 0.1,
          boxShadow: "0 0 10px rgba(0,200,255,0.8)",
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
        LATENCY {(12 + Math.sin(frame) * 4).toFixed(0)}ms
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
          height: "4px",
          backgroundColor: "#6FF9FF",
          opacity: 0.15,
          boxShadow: "0 0 20px 5px rgba(111, 249, 255, 0.4)",
          zIndex: 4,
        }}
      />
    </AbsoluteFill>
  );
};
