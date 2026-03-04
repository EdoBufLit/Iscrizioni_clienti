import { Composition, registerRoot } from "remotion";

import { AssonamWelcome } from "./AssonamWelcome";
import { FontLoader } from "./FontLoader";

const RemotionRoot: React.FC = () => {
  return (
    <FontLoader>
      <Composition
        id="AssonamWelcome"
        component={AssonamWelcome}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={450}
      />
    </FontLoader>
  );
};

registerRoot(RemotionRoot);
