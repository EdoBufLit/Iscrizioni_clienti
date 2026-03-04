import { useCurrentFrame } from "remotion";

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
  const relativeFrame = Math.max(0, frame - startFrame);
  const charsToShow = Math.floor(relativeFrame * charsPerFrame);
  const visibleText = text.slice(0, charsToShow);

  return (
    <>
      {visibleText}
    </>
  );
};
