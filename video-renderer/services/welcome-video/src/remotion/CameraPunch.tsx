import { ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

type CameraPunchProps = {
  children: ReactNode;
  triggerFrame: number;
};

const pseudoRandom = (seed: number): number => {
  const x = Math.sin(seed * 92.133) * 15731.743;
  return x - Math.floor(x);
};

export const CameraPunch: React.FC<CameraPunchProps> = ({ children, triggerFrame }) => {
  const frame = useCurrentFrame();
  
  // punch duration 10 frames
  const punch = interpolate(
    frame,
    [triggerFrame - 2, triggerFrame, triggerFrame + 4, triggerFrame + 10],
    [0, 1, 0.3, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const zoom = 1 + punch * 0.04; // zoomPeak 1.04
  const shakeStrength = 4 * punch; // maxShakePx 4
  const translateX = (pseudoRandom(frame * 2 + 17) - 0.5) * shakeStrength * 2;
  const translateY = (pseudoRandom(frame * 3 + 29) - 0.5) * shakeStrength * 2;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  );
};
