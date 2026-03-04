import { useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type Particle = {
  x: number;
  y: number;
  z: number; // 0 (far) to 1 (near)
  travelX: number;
  travelY: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  seed: number;
};

const pseudoRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const ParticlesIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 90 }).map((_, index) => {
        const seed = index + 1;
        const z = pseudoRandom(seed + 5);
        return {
          x: pseudoRandom(seed) * width,
          y: pseudoRandom(seed + 77) * height,
          z,
          travelX: (pseudoRandom(seed + 120) - 0.5) * 200 * z,
          travelY: (pseudoRandom(seed + 175) - 0.5) * 200 * z,
          wobbleSpeed: 0.05 + pseudoRandom(seed + 20) * 0.1,
          wobbleAmp: 3 + pseudoRandom(seed + 30) * 7,
          seed,
        };
      }),
    [width, height],
  );

  const opacityGlobal = interpolate(frame, [0, 24, 90, 120], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  const progress = interpolate(frame, [0, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      {particles.map((particle, index) => {
        const xBase = interpolate(progress, [0, 1], [particle.x, width / 2 + particle.travelX]);
        const yBase = interpolate(progress, [0, 1], [particle.y, height / 2 + particle.travelY]);
        
        const wobbleX = Math.sin(frame * particle.wobbleSpeed + particle.seed) * particle.wobbleAmp;
        const wobbleY = Math.cos(frame * particle.wobbleSpeed + particle.seed) * particle.wobbleAmp;

        const x = xBase + wobbleX;
        const y = yBase + wobbleY;

        const size = interpolate(particle.z, [0, 1], [1.2, 4.6]);
        const blur = interpolate(particle.z, [0, 1], [9, 2]);
        const alpha = interpolate(particle.z, [0, 1], [0.12, 0.70]);
        
        // Colors: near = rgba(190,230,255,0.9), far = rgba(255,255,255,0.65)
        const r = interpolate(particle.z, [0, 1], [255, 190]);
        const g = interpolate(particle.z, [0, 1], [255, 230]);
        const b = 255;
        const aColor = interpolate(particle.z, [0, 1], [0.65, 0.9]);

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: `rgba(${r}, ${g}, ${b}, ${aColor})`,
              filter: `blur(${blur}px) drop-shadow(0 0 10px rgba(120,200,255,0.18))`,
              opacity: alpha * opacityGlobal,
            }}
          />
        );
      })}
    </div>
  );
};
