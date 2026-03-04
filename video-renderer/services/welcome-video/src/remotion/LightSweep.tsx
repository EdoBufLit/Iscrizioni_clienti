import { interpolate, useCurrentFrame } from "remotion";

type LightSweepProps = {
  durationInFrames: number;
  startFrame?: number;
};

export const LightSweep: React.FC<LightSweepProps> = ({ durationInFrames, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;
  
  const x = interpolate(relativeFrame, [0, durationInFrames], [-600, 1200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (relativeFrame < 0 || relativeFrame > durationInFrames) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -200,
          bottom: -200,
          left: x,
          width: 120, // thinner
          transform: "rotate(35deg)", // diagonal 35deg
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)",
          filter: "blur(6px)",
          mixBlendMode: "screen",
          opacity: 0.28, // reduced opacity
        }}
      />
    </div>
  );
};
