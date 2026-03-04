import { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type ChromaticAberrationProps = {
  children: ReactNode;
  startFrame: number;
  endFrame: number;
  spikeFrames?: [number, number];
};

export const ChromaticAberration: React.FC<ChromaticAberrationProps> = ({
  children,
  startFrame,
  endFrame,
  spikeFrames,
}) => {
  const frame = useCurrentFrame();
  const baseIntensity = interpolate(
    frame,
    [startFrame, Math.floor((startFrame + endFrame) / 2), endFrame],
    [0, 0.4, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  let spikeIntensity = 0;
  if (spikeFrames) {
    const [spikeStart, spikeEnd] = spikeFrames;
    const midSpike = Math.floor((spikeStart + spikeEnd) / 2);
    spikeIntensity = interpolate(
      frame,
      [spikeStart, midSpike, spikeEnd],
      [0, 1.2, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }
    );
  }

  const intensity = baseIntensity + spikeIntensity;

  if (intensity <= 0.001) {
    return <>{children}</>;
  }

  const offset = 2 * intensity;

  return (
    <AbsoluteFill>
      <AbsoluteFill>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translateX(${offset}px)`,
          opacity: 0.15 * intensity,
          mixBlendMode: "screen",
          filter: "sepia(1) saturate(7) hue-rotate(-30deg)",
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translateX(${-offset}px)`,
          opacity: 0.15 * intensity,
          mixBlendMode: "screen",
          filter: "sepia(1) saturate(7) hue-rotate(180deg)",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
