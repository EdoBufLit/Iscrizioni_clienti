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
