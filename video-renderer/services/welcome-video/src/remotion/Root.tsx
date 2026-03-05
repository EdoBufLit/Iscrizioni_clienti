import { Composition, registerRoot } from "remotion";

import { AssonamWelcomeV2 } from "./v2/AssonamWelcomeV2";
import { FontLoader } from "./FontLoader";

const RemotionRoot: React.FC = () => {
  return (
    <FontLoader>
      <Composition
        id="AssonamWelcomeV2"
        component={AssonamWelcomeV2}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={330}
        defaultProps={{
          orgName: "",
          logoUrl: "",
        }}
      />
    </FontLoader>
  );
};

registerRoot(RemotionRoot);
