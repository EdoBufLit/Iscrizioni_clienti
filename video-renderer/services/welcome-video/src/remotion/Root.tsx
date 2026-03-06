import { Composition, registerRoot } from "remotion";

import { AssonamWelcomeV2 } from "./v2/AssonamWelcomeV2";
import { AssonamHUDWelcome } from "./hud/AssonamHUDWelcome";
import {
  HUD_RENDER_FPS,
  HUD_RENDER_HEIGHT,
  HUD_RENDER_WIDTH,
  HUD_TOTAL_FRAMES,
} from "./hud/hudRuntime";
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
        fps={HUD_RENDER_FPS}
        width={HUD_RENDER_WIDTH}
        height={HUD_RENDER_HEIGHT}
        durationInFrames={HUD_TOTAL_FRAMES}
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
        fps={HUD_RENDER_FPS}
        width={HUD_RENDER_WIDTH}
        height={HUD_RENDER_HEIGHT}
        durationInFrames={HUD_TOTAL_FRAMES}
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
