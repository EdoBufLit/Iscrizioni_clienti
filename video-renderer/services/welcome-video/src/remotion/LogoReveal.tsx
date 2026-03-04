import { spring, interpolate, useCurrentFrame, useVideoConfig, Img } from "remotion";

import logoPng from "../../assets/logo.png";
import { LightSweep } from "./LightSweep";

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: {
      damping: 200,
      stiffness: 110,
    },
  });

  const scale = 0.85 + progress * 0.15;
  const blur = interpolate(frame, [0, 18], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(1, frame / 18);

  const maskProgress = interpolate(frame, [0, 18], [0, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 1050,
          position: "relative",
          transform: `scale(${scale})`,
          opacity,
          filter: `blur(${blur}px) drop-shadow(0 0 22px rgba(120,200,255,0.16))`,
          maskImage: `radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${maskProgress}%, rgba(0,0,0,0) ${maskProgress + 20}%)`,
          WebkitMaskImage: `radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${maskProgress}%, rgba(0,0,0,0) ${maskProgress + 20}%)`,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
          }}
        >
          <Img
            src={logoPng}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
            }}
          />
          {frame >= 18 && <LightSweep durationInFrames={24} startFrame={18} />}
        </div>
      </div>
    </div>
  );
};
