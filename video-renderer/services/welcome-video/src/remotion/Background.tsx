import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { tokens } from "./tokens";

export const Background: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  const driftX = interpolate(frame, [0, 450], [-6, 6]);
  const driftY = interpolate(frame, [0, 450], [-6, 6]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bg,
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `translate(${driftX}px, ${driftY}px) scale(1.02)` }}>
        {/* Base */}
        <AbsoluteFill
          style={{
            background: "radial-gradient(circle at 45% 40%, rgba(15,25,45,0.8) 0%, rgba(5,7,12,1) 80%)",
          }}
        />
        {/* Bloom */}
        <AbsoluteFill
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(120,200,255,0.08) 0%, transparent 50%)",
          }}
        />
        {/* Noise drift */}
        <AbsoluteFill
          style={{
            opacity: 0.05,
            background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 1px, transparent 1px, transparent 4px)",
            transform: `translate(${-(frame * 0.1)}px, ${-(frame * 0.1)}px) scale(1.5)`,
          }}
        />
        {/* Vignette */}
        <AbsoluteFill
          style={{
            boxShadow: "inset 0 0 200px rgba(0,0,0,0.9)",
          }}
        />
      </div>
      {children}
    </AbsoluteFill>
  );
};

