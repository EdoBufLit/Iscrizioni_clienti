import { useCurrentFrame } from "remotion";
import { tokens } from "./tokens";
import { TypewriterText } from "./TypewriterText";

type DialogBoxProps = {
  text: string;
};

export const DialogBox: React.FC<DialogBoxProps> = ({ text }) => {
  const frame = useCurrentFrame();
  const startFrame = 0;
  const charsPerFrame = 0.5;

  const totalFramesForText = text.length / charsPerFrame;
  const isDone = frame >= startFrame + totalFramesForText;

  const blink = Math.floor(frame / 10) % 2 === 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 110,
        left: 120,
        right: 120,
        padding: 42,
        borderRadius: 18,
        border: "2px solid rgba(243,246,255,0.55)",
        backgroundColor: "rgba(10,12,18,0.82)",
        boxShadow: tokens.shadow,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Inner highlight */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
        }}
      />

      <div
        style={{
          color: tokens.white,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: "0.02em",
          lineHeight: 1.15,
        }}
      >
        <TypewriterText text={text} startFrame={startFrame} charsPerFrame={charsPerFrame} />
      </div>

      {isDone && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            right: 32,
            width: 0,
            height: 0,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: `14px solid ${tokens.white}`,
            opacity: blink ? 1 : 0,
          }}
        />
      )}
    </div>
  );
};
