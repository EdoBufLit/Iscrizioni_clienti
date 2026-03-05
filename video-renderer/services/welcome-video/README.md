# ASSONAM Welcome Video V2

This is a production-ready implementation of the ASSONAM welcome video rendering pipeline using Remotion, ElevenLabs, and FFmpeg.

## Setup

```bash
npm install
```

Note:
- `ffmpeg` must be in PATH.
- NVENC available => GPU encoding enabled automatically.
- SFX folders in `assets/sfx/<category>` must contain at least 1 mp3 each.

## Development

```bash
npm run preview
```

## Render Locally

```bash
npm run render:local
```

You can pass specific arguments to the render script:
```bash
node dist/render.js --orgId myOrg123 --orgName "My Org Name" --logoUrl "https://example.com/logo.png"
```

For `renderHud`, remote `logoUrl` values are fetched server-side and converted to data URLs before Remotion renders them. If the fetch fails, the renderer falls back to `public/logo-transparent.png`.

## Audio Source Modes (HUD renderer)

- `AUDIO_SOURCE=local` (default): use local pre-generated audio.
- `AUDIO_SOURCE=elevenlabs`: generate voice audio via ElevenLabs, requires:
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_IDS`
- `AUDIO_LOCAL_PATH` (default `.../assets/audio`): folder (or file path) used in local mode.

Supported local candidates:
- `welcome_hud_audio.wav`
- `welcome_hud_audio.mp3`
- `welcome_audio.wav`
- `welcome_audio.mp3`

If local audio is missing, renderer creates a silent fallback track and continues (no crash).

## Manual Worker Test (Docker)

```bash
docker compose exec affiliation-video-worker sh -lc \
  'AUDIO_SOURCE=local node /app/video-renderer/services/welcome-video/dist/renderHud.cjs --orgId 25 --orgName "ASSOCIATION 25" --mode review --template personalized --output /app/data/videos/welcome/25.mp4'
```

Verify output exists and size is greater than 200KB:

```bash
docker compose exec affiliation-video-worker sh -lc \
  'test -f /app/data/videos/welcome/25.mp4 && stat -c%s /app/data/videos/welcome/25.mp4'
```
