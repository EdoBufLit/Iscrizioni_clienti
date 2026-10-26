# Member profile dialog scrolling - 26 October 2026

Org admins could not reach Save when the member profile form exceeded the screen height. ModalShell locked page scrolling without constraining the panel or giving it its own scroll container; the existing mobile override only covered narrow screens.

The fix gives ModalShell panels a maximum height relative to the dynamic viewport, internal vertical scrolling and contained scroll propagation. A vh fallback is retained, and the org admin mobile override also uses dvh. Existing consumer height utilities continue to override the shared defaults.

Release scope: commit `02f3319d84ef61b7992bba3bfd66e91e3c37ba07` on `Main`, two frontend files, 10 insertions and one deletion. Other local frontend/backend work and deployment configuration changes were excluded. No new database migrations or business logic changes.

## Verification before deployment

- Isolated snapshot of the exact release: 83 frontend tests in 24 files passed; TypeScript and Vite/PWA production build passed.
- Production build browser checks at 1280x600, 768x600, 390x667, 844x390, 390x480 and 1440x1000, light/dark: wheel scroll reaches Save, required-name validation prevents submission, expanded 400px notes remain scrollable, exactly one simulated profile PATCH carries the changed name, reopening shows the updated value, and Escape restores page scroll/focus.
- API calls intercepted with synthetic fixtures; no real member modified. No horizontal overflow or JavaScript errors. Chromium/Edge with mobile viewport simulation; physical iOS/Safari excluded.
- At 1280x600 the corrected panel is 568px high and Save is reachable at y=571px. Before the fix the unbounded panel exceeded the viewport and mouse-wheel scrolling did not move it.
- Preflight server: all existing services healthy; disk 42% used, 21 GB available, inodes 9%, no Docker build cache. No cleanup needed.

## Deployment

GitHub Actions [Deploy to Hetzner, run 40326511574](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40326511574).

- Public HTTPS verification: `/health` returns 200 with `status=ok` and `db=true`; the published main JavaScript and CSS assets contain the new panel class, dynamic height limits and internal scroll styles. Public asset names match the isolated production build.
- Repeated all six browser scenarios against the actual published assets, with intercepted synthetic API fixtures and no real member changes: all passed, including reaching Save, validation, simulated save, expanded notes and close/focus restoration.
- Server checkout and all six application containers reference `02f3319d84ef61b7992bba3bfd66e91e3c37ba07`. Application, video and Evolution services healthy, zero restarts and no OOM; PostgreSQL accepts connections and internal health confirms DB access. The existing `/version` endpoint leaves git/build metadata unset, so release identity was verified through checkout, immutable container image tags and public assets instead.
- Disk after rollout: 43% used, 21 GB free; inodes 10%; Docker images 5.076 GB, no build cache. No cleanup needed. Git objects remain writable by the deploy user.

Workflow completed successfully at approximately 14:04 Europe/Rome on 26 October 2026. Both build and deploy jobs succeeded, including the final canary confirming stable services, health HTTP 200 and the database at Alembic head.
