import { Composition, registerRoot } from "remotion";

import { AssonamWelcomeV2 } from "./v2/AssonamWelcomeV2";
import { AssonamHUDWelcome } from "./hud/AssonamHUDWelcome";
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
      <Composition
        id="AssonamHUDWelcome"
        component={AssonamHUDWelcome}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={360}
        defaultProps={{
          orgName: "TEST ORG",
          logoUrl: "",
          logoAssetPath: "logo-transparent.png",
          mode: "review",
          template: "personalized",
          audioEnabled: true,
        }}
      />
      <Composition
        id="AssonamHUDWelcomeBase"
        component={AssonamHUDWelcome}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={360}
        defaultProps={{
          orgName: "",
          logoUrl: "",
          logoAssetPath: "logo-transparent.png",
          mode: "review",
          template: "base",
          audioEnabled: true,
        }}
      />
    </FontLoader>
  );
};

registerRoot(RemotionRoot);
