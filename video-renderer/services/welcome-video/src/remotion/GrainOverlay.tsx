import { useCurrentFrame } from "remotion";

export const GrainOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999, // Ensure it sits on top of everything
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -200, // extend to allow movement without edge clipping
          opacity: 0.03,
          mixBlendMode: "overlay",
          backgroundImage: `
            repeating-linear-gradient(105deg, rgba(255,255,255,0.4) 0px, rgba(0,0,0,0.4) 1px, transparent 1px, transparent 3px),
            repeating-linear-gradient(15deg, rgba(255,255,255,0.4) 0px, rgba(0,0,0,0.4) 1px, transparent 1px, transparent 3px)
          `,
          transform: `translate(${Math.sin(frame * 0.1) * 10}px, ${Math.cos(frame * 0.1) * 10}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 180px rgba(0,0,0,0.7)",
        }}
      />
    </div>
  );
};
