import { useCurrentFrame, useVideoConfig } from "remotion";
import { HUD_BASE_FPS } from "./hud/hudRuntime";

type TypewriterTextProps = {
  text: string;
  startFrame?: number;
  charsPerFrame?: number;
  onDone?: (isDone: boolean) => void;
};

export const TypewriterText: React.FC<TypewriterTextProps> = ({ 
  text, 
  startFrame = 0, 
  charsPerFrame = 0.5 
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timelineFrame = frame * (HUD_BASE_FPS / fps);
  const relativeFrame = Math.max(0, timelineFrame - startFrame);
  const charsToShow = Math.floor(relativeFrame * charsPerFrame);
  const visibleText = text.slice(0, charsToShow);

  return (
    <>
      {visibleText}
    </>
  );
};
