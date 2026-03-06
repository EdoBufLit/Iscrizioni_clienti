export const HUD_BASE_WIDTH = 1920;
export const HUD_BASE_HEIGHT = 1080;
export const HUD_BASE_FPS = 30;

export const HUD_RENDER_WIDTH = 1280;
export const HUD_RENDER_HEIGHT = 720;
export const HUD_RENDER_FPS = 24;
export const HUD_DURATION_SECONDS = 12;
export const HUD_TOTAL_FRAMES = HUD_RENDER_FPS * HUD_DURATION_SECONDS;

export const toHudTimelineFrame = (frame: number, fps: number): number => {
  return frame * (HUD_BASE_FPS / fps);
};

export const getHudCanvasScale = (width: number, height: number): number => {
  return Math.min(width / HUD_BASE_WIDTH, height / HUD_BASE_HEIGHT);
};
